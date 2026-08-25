import { supabase } from "../lib/supabase";
import { applyContextActivation } from "./ContextActivationEngine";
import type { Phase85ActivationResult } from "./types";

const n=(v:unknown,f:string)=>{const x=Number(v);if(!Number.isFinite(x))throw new Error(`[8-5] ${f} 숫자 변환 실패`);return x;};

export async function runPhase85ContextActivation():Promise<Phase85ActivationResult>{
  const {data,error}=await supabase.from("context_decision_gate_snapshots")
    .select("base_action,base_trading_permission,gate_permission,alignment,shadow_action,shadow_entry_quality_score,confidence,source_calculated_at")
    .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle();
  if(error||!data)throw new Error(`[8-5] Gate 조회 실패: ${error?.message??"데이터 없음"}`);
  const g:any=data;
  const source:any=g.source_calculated_at??{};
  let risk=0;
  if(source.context){
    const {data:c}=await supabase.from("market_context_snapshots").select("risk_score").eq("symbol","BTCUSDT").eq("calculated_at",source.context).limit(1).maybeSingle();
    if(c) risk=n((c as any).risk_score,"context risk");
  }
  const result=applyContextActivation({baseAction:g.base_action,baseTradingPermission:g.base_trading_permission,
    gatePermission:g.gate_permission,alignment:g.alignment,shadowAction:g.shadow_action,
    shadowEntryQualityScore:n(g.shadow_entry_quality_score,"entry"),gateConfidence:n(g.confidence,"confidence"),
    contextRiskScore:risk,mode:"guarded"});
  const {error:saveError}=await supabase.from("context_activation_snapshots").insert({
    symbol:"BTCUSDT",calculated_at:new Date().toISOString(),mode:result.mode,base_action:result.baseAction,
    effective_action:result.effectiveAction,effective_trading_permission:result.effectiveTradingPermission,
    effective_entry_quality_score:result.effectiveEntryQualityScore,applied:result.applied,
    blocked_by_context:result.blockedByContext,reasons:result.reasons,strategy_version:result.strategyVersion
  });
  if(saveError)throw new Error(`[8-5] snapshot 저장 실패: ${saveError.message}`);
  return result;
}
