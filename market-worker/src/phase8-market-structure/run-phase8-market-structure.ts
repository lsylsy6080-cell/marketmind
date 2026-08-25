import { supabase } from "../lib/supabase";
import { buildVolumeProfile } from "./VolumeProfileEngine";
import { buildSupportResistance, detectSwings } from "./SupportResistanceEngine";
import type { CandleRow, MarketType, Phase81Result, ProfileWindow, StructureTimeframe } from "./types";
const PROFILE_CONFIG:{window:ProfileWindow;timeframe:string;limit:number}[]=[{window:"24h",timeframe:"5m",limit:288},{window:"7d",timeframe:"15m",limit:672},{window:"30d",timeframe:"1h",limit:720}];
const STRUCTURE_CONFIG:{timeframe:StructureTimeframe;limit:number}[]=[{timeframe:"15m",limit:300},{timeframe:"1h",limit:300},{timeframe:"4h",limit:250},{timeframe:"1d",limit:180}];
function num(v:unknown){const n=Number(v);if(!Number.isFinite(n))throw new Error(`숫자 변환 실패: ${String(v)}`);return n}
async function load(marketType:MarketType,timeframe:string,limit:number):Promise<CandleRow[]>{
 const {data,error}=await supabase.from("market_candles").select("open_time,open,high,low,close,volume,quote_volume").eq("exchange","binance").eq("market_type",marketType).eq("symbol","BTCUSDT").eq("timeframe",timeframe).eq("is_closed",true).order("open_time",{ascending:false}).limit(limit);
 if(error)throw new Error(`[8-1] ${marketType}/${timeframe} 조회 실패: ${error.message}`);
 return [...(data??[])].reverse().map((r:any)=>({openTime:r.open_time,open:num(r.open),high:num(r.high),low:num(r.low),close:num(r.close),volume:num(r.volume),quoteVolume:num(r.quote_volume)}));
}
export async function runPhase81MarketStructure():Promise<Phase81Result>{
 const totalStart=Date.now(), loadStart=Date.now();
 const profileInputs=await Promise.all((["spot","futures"] as MarketType[]).flatMap(m=>PROFILE_CONFIG.map(async c=>({m,c,candles:await load(m,c.timeframe,c.limit)}))));
 const structureInputs=await Promise.all((["spot","futures"] as MarketType[]).flatMap(m=>STRUCTURE_CONFIG.map(async c=>({m,c,candles:await load(m,c.timeframe,c.limit)}))));
 const loadMs=Date.now()-loadStart;
 const currentPrice=profileInputs.find(x=>x.m==="spot"&&x.c.window==="24h")?.candles.at(-1)?.close;
 if(!currentPrice)throw new Error("[8-1] 현재 가격 확인 실패");
 const p0=Date.now(); const profiles=profileInputs.map(x=>buildVolumeProfile(x.m,x.c.window,x.c.timeframe,x.candles)); const profileMs=Date.now()-p0;
 const s0=Date.now(); const swings=structureInputs.flatMap(x=>detectSwings(x.candles,x.c.timeframe,x.m)); const sr=buildSupportResistance(currentPrice,profiles,swings); const structureMs=Date.now()-s0;
 const calculatedAt=new Date().toISOString(), mem=process.memoryUsage();
 const result:Phase81Result={symbol:"BTCUSDT",calculatedAt,currentPrice,profiles,...sr,performance:{loadMs,profileMs,structureMs,saveMs:0,totalMs:0,rssMb:Number((mem.rss/1048576).toFixed(1)),heapMb:Number((mem.heapUsed/1048576).toFixed(1))},strategyVersion:"phase8-market-structure-v8.1"};
 const saveStart=Date.now();
 const {error}=await supabase.from("market_structure_snapshots").insert({symbol:result.symbol,calculated_at:result.calculatedAt,current_price:result.currentPrice,profiles:result.profiles,nearest_support:result.nearestSupport,next_support:result.nextSupport,nearest_resistance:result.nearestResistance,next_resistance:result.nextResistance,support_levels:result.supportLevels,resistance_levels:result.resistanceLevels,performance:result.performance,strategy_version:result.strategyVersion});
 if(error)throw new Error(`[8-1] snapshot 저장 실패: ${error.message}`);
 result.performance.saveMs=Date.now()-saveStart; result.performance.totalMs=Date.now()-totalStart;
 return result;
}
