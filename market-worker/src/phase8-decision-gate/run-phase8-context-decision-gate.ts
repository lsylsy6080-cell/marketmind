import { supabase } from "../lib/supabase";
import { evaluateContextDecisionGate } from "./ContextDecisionGate";
import type { Phase84DecisionGateResult } from "./types";

const n=(v:unknown,f:string)=>{const x=Number(v);if(!Number.isFinite(x))throw new Error(`[8-4] ${f} 숫자 변환 실패: ${String(v)}`);return x;};

async function loadLatestSources(){
  const [d,c]=await Promise.all([
    supabase.from("ai_decision_v2_snapshots")
      .select("calculated_at,direction,action,entry_quality_score,trading_permission,final_confidence,risk_level")
      .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
    supabase.from("market_context_snapshots")
      .select("calculated_at,preferred_direction,permission,confidence,context_score,risk_score,structure_state")
      .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(d.error||!d.data)throw new Error(`[8-4] Decision V2 조회 실패: ${d.error?.message??"데이터 없음"}`);
  if(c.error||!c.data)throw new Error(`[8-4] Market Context 조회 실패: ${c.error?.message??"데이터 없음"}`);
  const x:any=d.data,y:any=c.data;
  return {
    decision:{symbol:"BTCUSDT" as const,calculatedAt:String(x.calculated_at),direction:x.direction,action:x.action,entryQualityScore:n(x.entry_quality_score,"entry_quality_score"),tradingPermission:x.trading_permission,finalConfidence:n(x.final_confidence,"final_confidence"),riskLevel:x.risk_level},
    context:{symbol:"BTCUSDT" as const,calculatedAt:String(y.calculated_at),preferredDirection:y.preferred_direction,permission:y.permission,confidence:n(y.confidence,"context.confidence"),contextScore:n(y.context_score,"context_score"),riskScore:n(y.risk_score,"risk_score"),structureState:y.structure_state},
  };
}

export async function runPhase84ContextDecisionGate():Promise<Phase84DecisionGateResult>{
  const totalStart=Date.now(),loadStart=Date.now();
  const source=await loadLatestSources();
  const loadMs=Date.now()-loadStart,analysisStart=Date.now();
  const base=evaluateContextDecisionGate(source);
  const analysisMs=Date.now()-analysisStart,mem=process.memoryUsage();
  const result:Phase84DecisionGateResult={...base,performance:{loadMs,analysisMs,saveMs:0,totalMs:0,rssMb:Number((mem.rss/1048576).toFixed(1)),heapMb:Number((mem.heapUsed/1048576).toFixed(1))}};
  const saveStart=Date.now();
  const {error}=await supabase.from("context_decision_gate_snapshots").insert({
    symbol:result.symbol,calculated_at:result.calculatedAt,base_direction:result.baseDirection,base_action:result.baseAction,
    base_trading_permission:result.baseTradingPermission,context_direction:result.contextDirection,context_permission:result.contextPermission,
    alignment:result.alignment,gate_permission:result.gatePermission,shadow_action:result.shadowAction,entry_score_delta:result.entryScoreDelta,
    shadow_entry_quality_score:result.shadowEntryQualityScore,confidence:result.confidence,reasons:result.reasons,
    source_calculated_at:result.sourceCalculatedAt,performance:result.performance,strategy_version:result.strategyVersion,
  });
  if(error)throw new Error(`[8-4] snapshot 저장 실패: ${error.message}`);
  result.performance.saveMs=Date.now()-saveStart;result.performance.totalMs=Date.now()-totalStart;
  return result;
}
