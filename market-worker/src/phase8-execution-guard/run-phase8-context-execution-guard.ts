import { supabase } from "../lib/supabase";
import { evaluateContextExecutionGuard } from "./ContextExecutionGuard";
import type { ExecutionSide, Phase86ExecutionGuardResult } from "./types";

export async function runPhase86ContextExecutionGuard(side:ExecutionSide):Promise<Phase86ExecutionGuardResult>{
  const {data,error}=await supabase.from("context_activation_snapshots")
    .select("calculated_at,effective_action,effective_trading_permission,effective_entry_quality_score,applied,blocked_by_context")
    .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle();
  if(error||!data)throw new Error(`[8-6] Activation 조회 실패: ${error?.message??"데이터 없음"}`);
  const x:any=data;
  const age=(Date.now()-new Date(String(x.calculated_at)).getTime())/60000;
  const result=evaluateContextExecutionGuard({
    side,activationAction:x.effective_action,activationPermission:x.effective_trading_permission,
    activationEntryQualityScore:Number(x.effective_entry_quality_score),activationApplied:Boolean(x.applied),
    blockedByContext:Boolean(x.blocked_by_context),activationAgeMinutes:Number.isFinite(age)?age:999
  });
  const {error:saveError}=await supabase.from("context_execution_guard_snapshots").insert({
    symbol:"BTCUSDT",calculated_at:new Date().toISOString(),side,permission:result.permission,
    margin_multiplier:result.marginMultiplier,side_allowed:result.sideAllowed,reasons:result.reasons,
    strategy_version:result.strategyVersion
  });
  if(saveError)throw new Error(`[8-6] snapshot 저장 실패: ${saveError.message}`);
  return result;
}
