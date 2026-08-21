import { supabase } from "../lib/supabase";
import { calculateAdaptivePositionSizing } from "./AdaptivePositionSizingEngine";
import type { AdaptiveSizingPlan } from "./types";

type LatestV2Row = {
  id:number; calculated_at:string; direction:string; direction_strength:number|string;
  entry_quality_score:number|string; overheat_risk:number|string; reversal_risk:number|string;
  data_reliability:number|string; trading_permission:string; funding_crowding_risk:number|string|null;
  entry_plan:any; entry_trigger:any; regime_snapshot_id:number|null; strategy_version:string;
};

const num=(v:unknown,fallback=0)=>{const n=Number(v);return Number.isFinite(n)?n:fallback};

export async function runAdaptiveSizing(options?:{dryRun?:boolean}):Promise<AdaptiveSizingPlan>{
  const [v2Result, accountResult] = await Promise.all([
    supabase.from("ai_decision_v2_snapshots")
      .select("id,calculated_at,direction,direction_strength,entry_quality_score,overheat_risk,reversal_risk,data_reliability,trading_permission,funding_crowding_risk,entry_plan,entry_trigger,regime_snapshot_id,strategy_version")
      .eq("symbol","BTCUSDT")
      .eq("strategy_version","decision-engine-v2.5.1-entry-trigger-validator")
      .order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("paper_trading_accounts")
      .select("id,cash_balance,is_active")
      .eq("is_active",true).order("id",{ascending:true}).limit(1).maybeSingle(),
  ]);
  if(v2Result.error) throw new Error(`[Sizing] V2 조회 실패: ${v2Result.error.message}`);
  if(!v2Result.data) throw new Error("[Sizing] V2 판단 데이터가 없습니다.");
  if(accountResult.error) throw new Error(`[Sizing] 모의 계정 조회 실패: ${accountResult.error.message}`);
  if(!accountResult.data) throw new Error("[Sizing] 활성 모의 계정이 없습니다.");

  const v2=v2Result.data as LatestV2Row;
  let regimeConfidence=0;
  if(v2.regime_snapshot_id){
    const {data,error}=await supabase.from("market_regime_snapshots")
      .select("confidence").eq("id",v2.regime_snapshot_id).maybeSingle();
    if(error) throw new Error(`[Sizing] Regime 조회 실패: ${error.message}`);
    regimeConfidence=num(data?.confidence,0);
  }

  const plan=v2.entry_trigger?.referencePlan ?? v2.entry_plan ?? null;
  const current=num(v2.entry_plan?.currentPrice,0);
  const invalid=num(plan?.invalidationPrice,0);
  const stopLossDistancePercent=current>0&&invalid>0 ? Math.abs(current-invalid)/current*100 : 0;

  const result=calculateAdaptivePositionSizing({
    accountEquity:num(accountResult.data.cash_balance,0),
    triggerStatus:v2.entry_trigger?.status ?? "UNAVAILABLE",
    direction:(v2.direction ?? "neutral") as any,
    entryQualityScore:num(v2.entry_quality_score),
    directionStrength:num(v2.direction_strength),
    regimeConfidence,
    dataReliability:num(v2.data_reliability),
    overheatRisk:num(v2.overheat_risk),
    reversalRisk:num(v2.reversal_risk),
    fundingCrowdingRisk:num(v2.funding_crowding_risk),
    tradingPermission:(v2.trading_permission ?? "blocked") as any,
    stopLossDistancePercent,
  });

  if(!options?.dryRun){
    const {error}=await supabase.from("adaptive_position_sizing_snapshots").upsert({
      symbol:"BTCUSDT",
      calculated_at:new Date().toISOString(),
      decision_v2_id:v2.id,
      trigger_status:v2.entry_trigger?.status ?? "UNAVAILABLE",
      sizing_status:result.status,
      risk_tier:result.riskTier,
      sizing_score:result.sizingScore,
      margin_percent:result.marginPercent,
      leverage:result.leverage,
      effective_exposure_multiple:result.effectiveExposureMultiple,
      effective_exposure_percent:result.effectiveExposurePercent,
      margin_amount:result.marginAmount,
      notional_amount:result.notionalAmount,
      max_account_risk_percent:result.maxAccountRiskPercent,
      estimated_stop_loss_risk_percent:result.estimatedStopLossRiskPercent,
      estimated_stop_loss_amount:result.estimatedStopLossAmount,
      stop_loss_distance_percent:stopLossDistancePercent,
      caps_applied:result.capsApplied,
      blockers:result.blockers,
      reasons:result.reasons,
      apply_mode:"shadow",
      strategy_version:result.strategyVersion,
    }, { onConflict:"decision_v2_id,strategy_version", ignoreDuplicates:false });
    if(error) throw new Error(`[Sizing] snapshot 저장 실패: ${error.message}`);
  }
  return result;
}
