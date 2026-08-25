import { supabase } from "../lib/supabase";
import { evaluateContextExecutionOutcome } from "./ContextExecutionOutcome";
import type { GuardPermission, Phase87OutcomeResult } from "./types";

const HORIZON_MINUTES=15;

type RunResult =
  | {status:"evaluated"; result:Phase87OutcomeResult}
  | {status:"waiting"; reason:string};

async function loadCandleAtOrAfter(at:string):Promise<{openTime:string;close:number}|null>{
  const {data,error}=await supabase.from("market_candles")
    .select("open_time,close")
    .eq("exchange","binance").eq("market_type","spot").eq("symbol","BTCUSDT")
    .eq("timeframe","1m").eq("is_closed",true)
    .gte("open_time",at).order("open_time",{ascending:true}).limit(1).maybeSingle();
  if(error) throw new Error(`[8-7] candle 조회 실패: ${error.message}`);
  if(!data) return null;
  const close=Number((data as any).close);
  if(!Number.isFinite(close)||close<=0) throw new Error("[8-7] candle close 오류");
  return {openTime:String((data as any).open_time),close};
}

export async function runPhase87ContextOutcome():Promise<RunResult>{
  const maturedBefore=new Date(Date.now()-HORIZON_MINUTES*60_000).toISOString();
  const {data:guards,error}=await supabase.from("context_execution_guard_snapshots")
    .select("id,calculated_at,side,permission,margin_multiplier")
    .eq("symbol","BTCUSDT").lte("calculated_at",maturedBefore)
    .order("calculated_at",{ascending:false}).limit(20);
  if(error) throw new Error(`[8-7] Guard 조회 실패: ${error.message}`);
  if(!guards?.length) return {status:"waiting",reason:"15분 이상 경과한 Guard 없음"};

  for(const row of guards as any[]){
    const {data:existing,error:existingError}=await supabase.from("context_execution_outcome_snapshots")
      .select("id").eq("guard_snapshot_id",Number(row.id)).limit(1).maybeSingle();
    if(existingError) throw new Error(`[8-7] 중복 확인 실패: ${existingError.message}`);
    if(existing) continue;

    const guardAt=String(row.calculated_at);
    const targetAt=new Date(new Date(guardAt).getTime()+HORIZON_MINUTES*60_000).toISOString();
    const [reference,future]=await Promise.all([loadCandleAtOrAfter(guardAt),loadCandleAtOrAfter(targetAt)]);
    if(!reference||!future) return {status:"waiting",reason:"성과 평가용 1m candle 부족"};

    const result=evaluateContextExecutionOutcome({
      side:row.side,
      permission:row.permission as GuardPermission,
      marginMultiplier:Number(row.margin_multiplier),
      referencePrice:reference.close,
      futurePrice:future.close,
      horizonMinutes:HORIZON_MINUTES,
    });

    const {error:saveError}=await supabase.from("context_execution_outcome_snapshots").insert({
      symbol:"BTCUSDT",
      calculated_at:new Date().toISOString(),
      guard_snapshot_id:Number(row.id),
      guard_calculated_at:guardAt,
      side:result.side,
      permission:result.permission,
      margin_multiplier:Number(row.margin_multiplier),
      reference_price:reference.close,
      future_price:future.close,
      directional_return_percent:result.directionalReturnPercent,
      outcome_label:result.label,
      quality_score:result.qualityScore,
      horizon_minutes:result.horizonMinutes,
      strategy_version:result.strategyVersion,
    });
    if(saveError) throw new Error(`[8-7] outcome 저장 실패: ${saveError.message}`);
    return {status:"evaluated",result};
  }
  return {status:"waiting",reason:"평가 대기 중인 Guard 없음"};
}
