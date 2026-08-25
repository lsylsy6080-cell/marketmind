import type { Phase86ExecutionGuardInput, Phase86ExecutionGuardResult } from "./types";

export function evaluateContextExecutionGuard(input:Phase86ExecutionGuardInput):Phase86ExecutionGuardResult{
  const reasons:string[]=[];
  if(input.activationAgeMinutes>5){
    return {permission:"blocked",marginMultiplier:0,sideAllowed:false,reasons:["Context Activation snapshot stale > 5m"],strategyVersion:"phase8-execution-guard-v8.6"};
  }
  if(input.blockedByContext || input.activationPermission==="blocked" || input.activationAction==="wait"){
    return {permission:"blocked",marginMultiplier:0,sideAllowed:false,reasons:["Context Activation이 신규 진입을 차단"],strategyVersion:"phase8-execution-guard-v8.6"};
  }
  const actionSide=input.activationAction==="strong_buy"||input.activationAction==="buy"?"long":
    input.activationAction==="sell"||input.activationAction==="reduce"?"short":null;
  if(actionSide!==input.side){
    return {permission:"blocked",marginMultiplier:0,sideAllowed:false,reasons:["Activation action과 진입 방향 불일치"],strategyVersion:"phase8-execution-guard-v8.6"};
  }
  if(input.activationPermission==="caution" || input.activationEntryQualityScore<60){
    reasons.push("Context caution/낮은 entry quality → 증거금 축소");
    return {permission:"reduced",marginMultiplier:0.5,sideAllowed:true,reasons,strategyVersion:"phase8-execution-guard-v8.6"};
  }
  reasons.push("Context Activation 진입 조건 통과");
  return {permission:"allowed",marginMultiplier:1,sideAllowed:true,reasons,strategyVersion:"phase8-execution-guard-v8.6"};
}
