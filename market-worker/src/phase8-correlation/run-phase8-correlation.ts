import { supabase } from "../lib/supabase";
import { aggregateCorrelationIntelligence, analyzeTimeframeCorrelation } from "./MarketCorrelationEngine";
import type { CorrelationCandle, CorrelationTimeframe, Phase82CorrelationResult } from "./types";
const CONFIG:Array<{timeframe:CorrelationTimeframe;limit:number}>=[{timeframe:"15m",limit:240},{timeframe:"1h",limit:240},{timeframe:"4h",limit:180}];
function num(v:unknown,field:string){const n=Number(v);if(!Number.isFinite(n))throw new Error(`[8-2] ${field} 숫자 변환 실패`);return n;}
async function load(marketType:"spot"|"futures",timeframe:CorrelationTimeframe,limit:number):Promise<CorrelationCandle[]>{
  const {data,error}=await supabase.from("market_candles").select("open_time,close").eq("exchange","binance").eq("market_type",marketType).eq("symbol","BTCUSDT").eq("timeframe",timeframe).eq("is_closed",true).order("open_time",{ascending:false}).limit(limit);
  if(error)throw new Error(`[8-2] ${marketType}/${timeframe} 조회 실패: ${error.message}`);
  return [...(data??[])].reverse().map((r:any)=>({openTime:r.open_time,close:num(r.close,`${marketType}/${timeframe}.close`)}));
}
export async function runPhase82Correlation():Promise<Phase82CorrelationResult>{
  const totalStart=Date.now(),loadStart=Date.now();
  const inputs=await Promise.all(CONFIG.map(async c=>({c,spot:await load("spot",c.timeframe,c.limit),futures:await load("futures",c.timeframe,c.limit)})));
  const loadMs=Date.now()-loadStart,analysisStart=Date.now();
  const details=inputs.map(x=>analyzeTimeframeCorrelation({timeframe:x.c.timeframe,spotCandles:x.spot,futuresCandles:x.futures}));
  const aggregate=aggregateCorrelationIntelligence(details),analysisMs=Date.now()-analysisStart,mem=process.memoryUsage();
  const result:Phase82CorrelationResult={...aggregate,performance:{loadMs,analysisMs,saveMs:0,totalMs:0,rssMb:Number((mem.rss/1048576).toFixed(1)),heapMb:Number((mem.heapUsed/1048576).toFixed(1))}};
  const saveStart=Date.now();
  const {error}=await supabase.from("market_correlation_snapshots").insert({symbol:result.symbol,calculated_at:result.calculatedAt,overall_correlation:result.overallCorrelation,overall_divergence_score:result.overallDivergenceScore,state:result.state,risk_level:result.riskLevel,timeframe_details:result.timeframeDetails,reasons:result.reasons,performance:result.performance,strategy_version:result.strategyVersion});
  if(error)throw new Error(`[8-2] snapshot 저장 실패: ${error.message}`);
  result.performance.saveMs=Date.now()-saveStart;result.performance.totalMs=Date.now()-totalStart;return result;
}
