import { supabase } from "../lib/supabase";
import type { ShadowValidationResult } from "./types";
import type { PricePoint } from "./ShadowSignalValidator";

export async function loadShadowValidationData(windowHours=168){
  const cutoff=new Date(Date.now()-(windowHours+24)*3600_000).toISOString();
  const signalCutoff=new Date(Date.now()-windowHours*3600_000).toISOString();
  const [news,funding,candles]=await Promise.all([
    supabase.from("news_scores").select("calculated_at,weighted_score,direction").eq("symbol","BTCUSDT").gte("calculated_at",signalCutoff).order("calculated_at",{ascending:true}).limit(5000),
    supabase.from("funding_snapshots").select("fetched_at,funding_rate,direction,score").eq("symbol","BTCUSDT").gte("fetched_at",signalCutoff).order("fetched_at",{ascending:true}).limit(5000),
    supabase.from("market_candles").select("open_time,close").eq("exchange","binance").eq("market_type","spot").eq("symbol","BTCUSDT").eq("timeframe","5m").eq("is_closed",true).gte("open_time",cutoff).order("open_time",{ascending:true}).limit(5000),
  ]);
  if(news.error)throw new Error(`[Shadow Validation] News 조회 실패: ${news.error.message}`);
  if(funding.error)throw new Error(`[Shadow Validation] Funding 조회 실패: ${funding.error.message}`);
  if(candles.error)throw new Error(`[Shadow Validation] Candle 조회 실패: ${candles.error.message}`);
  const prices:PricePoint[]=(candles.data??[]).map(r=>({at:String(r.open_time),close:Number(r.close)})).filter(r=>Number.isFinite(r.close));
  return {newsRows:news.data??[],fundingRows:funding.data??[],prices};
}

export async function saveShadowValidation(result:ShadowValidationResult):Promise<void>{
  const {error}=await supabase.from("shadow_signal_validation_snapshots").insert({symbol:result.symbol,calculated_at:result.calculatedAt,window_hours:result.windowHours,calibration_ratio:result.calibrationRatio,return_threshold_percent:result.validationReturnThresholdPercent,news_validation:result.news,funding_validation:result.funding,overall_verdict:result.overallVerdict,recommendations:result.recommendations,strategy_version:result.strategyVersion});
  if(error)throw new Error(`[Shadow Validation] 저장 실패: ${error.message}`);
}
