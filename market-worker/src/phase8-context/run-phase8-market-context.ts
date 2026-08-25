import { supabase } from "../lib/supabase";
import type { Phase81Result } from "../phase8-market-structure/types";
import type { Phase82CorrelationResult } from "../phase8-correlation/types";
import { buildMarketContext } from "./MarketContextEngine";
import type { Phase83MarketContextResult } from "./types";

function n(v:unknown){const x=Number(v);if(!Number.isFinite(x))throw new Error(`[8-3] 숫자 변환 실패: ${String(v)}`);return x;}
function level(v:any){return v?{price:n(v.price),strength:n(v.strength),distancePercent:n(v.distancePercent),kind:v.kind,sources:Array.isArray(v.sources)?v.sources:[]}:null;}

async function loadLatestSources():Promise<{structure:Phase81Result;correlation:Phase82CorrelationResult}> {
  const [s,c]=await Promise.all([
    supabase.from("market_structure_snapshots").select("symbol,calculated_at,current_price,nearest_support,nearest_resistance").eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("market_correlation_snapshots").select("symbol,calculated_at,overall_correlation,overall_divergence_score,state,risk_level").eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle()
  ]);
  if(s.error||!s.data)throw new Error(`[8-3] Market Structure 조회 실패: ${s.error?.message??"데이터 없음"}`);
  if(c.error||!c.data)throw new Error(`[8-3] Correlation 조회 실패: ${c.error?.message??"데이터 없음"}`);
  return {
    structure:{symbol:"BTCUSDT",calculatedAt:String(s.data.calculated_at),currentPrice:n(s.data.current_price),nearestSupport:level(s.data.nearest_support),nearestResistance:level(s.data.nearest_resistance),nextSupport:null,nextResistance:null,profiles:[],supportLevels:[],resistanceLevels:[],performance:{loadMs:0,profileMs:0,structureMs:0,saveMs:0,totalMs:0,rssMb:0,heapMb:0},strategyVersion:"phase8-market-structure-v8.1"},
    correlation:{symbol:"BTCUSDT",calculatedAt:String(c.data.calculated_at),overallCorrelation:n(c.data.overall_correlation),overallDivergenceScore:n(c.data.overall_divergence_score),state:c.data.state,riskLevel:c.data.risk_level,timeframeDetails:[],reasons:[],performance:{loadMs:0,analysisMs:0,saveMs:0,totalMs:0,rssMb:0,heapMb:0},strategyVersion:"phase8-correlation-v8.2"}
  } as {structure:Phase81Result;correlation:Phase82CorrelationResult};
}

export async function runPhase83MarketContext(sources?:{structure:Phase81Result;correlation:Phase82CorrelationResult}):Promise<Phase83MarketContextResult>{
  const totalStart=Date.now(),loadStart=Date.now();
  const source=sources??await loadLatestSources();
  const loadMs=Date.now()-loadStart,analysisStart=Date.now();
  const base=buildMarketContext({structure:source.structure,correlation:source.correlation});
  const analysisMs=Date.now()-analysisStart,mem=process.memoryUsage();
  const result:Phase83MarketContextResult={...base,performance:{loadMs,analysisMs,saveMs:0,totalMs:0,rssMb:Number((mem.rss/1048576).toFixed(1)),heapMb:Number((mem.heapUsed/1048576).toFixed(1))}};
  const saveStart=Date.now();
  const {error}=await supabase.from("market_context_snapshots").insert({symbol:result.symbol,calculated_at:result.calculatedAt,preferred_direction:result.preferredDirection,permission:result.permission,confidence:result.confidence,context_score:result.contextScore,risk_score:result.riskScore,structure_state:result.structureState,upside_room_percent:result.upsideRoomPercent,downside_room_percent:result.downsideRoomPercent,support_strength:result.supportStrength,resistance_strength:result.resistanceStrength,correlation_state:result.correlationState,correlation_risk_level:result.correlationRiskLevel,reasons:result.reasons,source_calculated_at:result.sourceCalculatedAt,performance:result.performance,strategy_version:result.strategyVersion});
  if(error)throw new Error(`[8-3] snapshot 저장 실패: ${error.message}`);
  result.performance.saveMs=Date.now()-saveStart;result.performance.totalMs=Date.now()-totalStart;return result;
}
