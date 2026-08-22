import "dotenv/config";
import { supabase } from "../lib/supabase";
import { classifyOpenInterestFlow } from "./OpenInterestIntelligenceEngine";
import type { OpenInterestSnapshot } from "./types";

const OI_URL="https://fapi.binance.com/fapi/v1/openInterest";
const PRICE_URL="https://fapi.binance.com/fapi/v1/ticker/price";
const SYMBOL="BTCUSDT";

const n=(v:unknown)=>{const x=Number(v);if(!Number.isFinite(x))throw new Error(`invalid number: ${String(v)}`);return x};
const round=(v:number,d=6)=>{const m=10**d;return Math.round(v*m)/m};

async function getJson(url:string){
  const response=await fetch(url,{signal:AbortSignal.timeout(12_000)});
  if(!response.ok) throw new Error(`[OI] Binance HTTP ${response.status}`);
  return response.json();
}

async function getPastSnapshot(targetMs:number){
  const target=new Date(targetMs).toISOString();
  const {data,error}=await supabase.from("btc_open_interest_snapshots")
    .select("fetched_at,price,open_interest")
    .eq("symbol",SYMBOL).lte("fetched_at",target)
    .order("fetched_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error(`[OI] 과거 snapshot 조회 실패: ${error.message}`);
  return data as {fetched_at:string;price:number|string;open_interest:number|string}|null;
}

function pct(current:number,past:number|null){
  if(past==null||!Number.isFinite(past)||past<=0)return null;
  return round((current-past)/past*100,6);
}

export async function collectOpenInterestSnapshot():Promise<OpenInterestSnapshot>{
  const now=new Date();
  const [oiRaw,priceRaw]=await Promise.all([
    getJson(`${OI_URL}?symbol=${SYMBOL}`),
    getJson(`${PRICE_URL}?symbol=${SYMBOL}`),
  ]);
  const openInterest=n((oiRaw as any).openInterest);
  const price=n((priceRaw as any).price);

  const [p5,p15,p60]=await Promise.all([
    getPastSnapshot(now.getTime()-5*60_000),
    getPastSnapshot(now.getTime()-15*60_000),
    getPastSnapshot(now.getTime()-60*60_000),
  ]);

  const price5=pct(price,p5?Number(p5.price):null);
  const price15=pct(price,p15?Number(p15.price):null);
  const price60=pct(price,p60?Number(p60.price):null);
  const oi5=pct(openInterest,p5?Number(p5.open_interest):null);
  const oi15=pct(openInterest,p15?Number(p15.open_interest):null);
  const oi60=pct(openInterest,p60?Number(p60.open_interest):null);

  const evaluation=classifyOpenInterestFlow({
    priceChange15mPercent:price15,oiChange15mPercent:oi15,
    priceChange1hPercent:price60,oiChange1hPercent:oi60,
  });

  const snapshot:OpenInterestSnapshot={
    symbol:"BTCUSDT",fetchedAt:now.toISOString(),price:round(price,2),
    openInterest:round(openInterest,8),openInterestValue:round(openInterest*price,2),
    oiChange5mPercent:oi5,oiChange15mPercent:oi15,oiChange1hPercent:oi60,
    priceChange5mPercent:price5,priceChange15mPercent:price15,priceChange1hPercent:price60,
    ...evaluation,strategyVersion:"open-interest-intelligence-v7.9",
  };

  const bucket=new Date(Math.floor(now.getTime()/60_000)*60_000).toISOString();
  const {error}=await supabase.from("btc_open_interest_snapshots").upsert({
    symbol:snapshot.symbol,bucket_time:bucket,fetched_at:snapshot.fetchedAt,
    price:snapshot.price,open_interest:snapshot.openInterest,open_interest_value:snapshot.openInterestValue,
    oi_change_5m_percent:snapshot.oiChange5mPercent,oi_change_15m_percent:snapshot.oiChange15mPercent,
    oi_change_1h_percent:snapshot.oiChange1hPercent,price_change_5m_percent:snapshot.priceChange5mPercent,
    price_change_15m_percent:snapshot.priceChange15mPercent,price_change_1h_percent:snapshot.priceChange1hPercent,
    flow_state:snapshot.flowState,directional_bias:snapshot.directionalBias,confidence:snapshot.confidence,
    entry_adjustment:snapshot.entryAdjustment,overheat_adjustment:snapshot.overheatAdjustment,
    reversal_adjustment:snapshot.reversalAdjustment,reasons:snapshot.reasons,strategy_version:snapshot.strategyVersion,
  },{onConflict:"symbol,bucket_time"});
  if(error) throw new Error(`[OI] snapshot 저장 실패: ${error.message}`);
  return snapshot;
}
