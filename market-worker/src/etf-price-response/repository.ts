import { supabase } from "../lib/supabase";
import type { EtfFlowPriceResponseResult } from "./types";

export interface EtfSnapshotRow {
  id:number;
  asset:string;
  market:string;
  flow_date:string;
  total_flow_usd:number;
  source:string;
}

export interface PricePoint {
  at:string;
  close:number;
}

export async function loadRecentBtcEtfFlows(limit=20):Promise<EtfSnapshotRow[]>{
  const {data,error}=await supabase
    .from("etf_flow_snapshots")
    .select("id,asset,market,flow_date,total_flow_usd,source")
    .eq("asset","BTC")
    .eq("market","US")
    .order("flow_date",{ascending:false})
    .limit(limit);

  if(error)throw new Error(`[ETF 가격반응] ETF 흐름 조회 실패: ${error.message}`);

  return ((data??[]) as any[])
    .map((row)=>({
      id:Number(row.id),
      asset:String(row.asset),
      market:String(row.market),
      flow_date:String(row.flow_date),
      total_flow_usd:Number(row.total_flow_usd),
      source:String(row.source),
    }))
    .filter((row)=>Number.isFinite(row.total_flow_usd));
}

export async function loadBtcPrices(
  startAt:string,
  endAt:string,
):Promise<PricePoint[]>{
  const {data,error}=await supabase
    .from("market_candles")
    .select("open_time,close")
    .eq("exchange","binance")
    .eq("market_type","spot")
    .eq("symbol","BTCUSDT")
    .eq("timeframe","5m")
    .eq("is_closed",true)
    .gte("open_time",startAt)
    .lte("open_time",endAt)
    .order("open_time",{ascending:true})
    .limit(2000);

  if(error)throw new Error(`[ETF 가격반응] BTC 가격 조회 실패: ${error.message}`);

  return ((data??[]) as any[])
    .map((row)=>({at:String(row.open_time),close:Number(row.close)}))
    .filter((row)=>Number.isFinite(row.close)&&row.close>0);
}

export async function saveEtfPriceResponse(
  result:EtfFlowPriceResponseResult,
  source:string,
):Promise<void>{
  const reaction=(hours:number)=>result.reactions.find((r)=>r.horizonHours===hours);

  const {error}=await supabase
    .from("etf_flow_price_responses")
    .upsert({
      asset:result.asset,
      market:"US",
      flow_date:result.flowDate,
      source,
      observed_at:result.observedAt,
      flow_usd:result.flowUsd,
      flow_direction:result.flowDirection,
      flow_strength:result.flowStrength,
      anchor_price_usd:result.anchorPriceUsd,

      return_6h_pct:reaction(6)?.returnPercent??null,
      return_12h_pct:reaction(12)?.returnPercent??null,
      return_24h_pct:reaction(24)?.returnPercent??null,
      return_48h_pct:reaction(48)?.returnPercent??null,

      state:result.state,
      score:result.score,
      confidence:result.confidence,
      bullish_evidence:result.bullishEvidence,
      bearish_evidence:result.bearishEvidence,
      summary:result.summary,
      strategy_version:result.strategyVersion,
      calculated_at:new Date().toISOString(),
      raw_data:{reactions:result.reactions},
    },{
      onConflict:"asset,market,flow_date,source,strategy_version",
    });

  if(error)throw new Error(`[ETF 가격반응] 분석 저장 실패: ${error.message}`);
}
