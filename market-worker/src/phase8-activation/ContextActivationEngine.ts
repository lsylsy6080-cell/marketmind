import type { Phase85ActivationInput, Phase85ActivationResult, ActivationPermission } from "./types";

const clamp=(v:number)=>Math.max(0,Math.min(100,v));

export function applyContextActivation(input:Phase85ActivationInput):Phase85ActivationResult {
  const mode=input.mode ?? "guarded";
  const reasons:string[]=[];
  let effectiveAction=input.baseAction;
  let permission:ActivationPermission=input.baseTradingPermission;
  let entry=clamp(input.shadowEntryQualityScore);
  let applied=false;
  let blocked=false;

  if(mode==="shadow"){
    reasons.push("shadow mode: 기존 Decision V2 실행값 유지");
    return {mode,baseAction:input.baseAction,effectiveAction,effectiveTradingPermission:permission,
      effectiveEntryQualityScore:entry,applied:false,blockedByContext:false,reasons,
      strategyVersion:"phase8-context-activation-v8.5"};
  }

  if(input.gatePermission==="blocked"){
    effectiveAction="wait"; permission="blocked"; entry=Math.min(entry,35);
    applied=true; blocked=true; reasons.push("Context Gate BLOCKED → 신규 진입 차단");
  } else if(input.gatePermission==="caution"){
    permission=permission==="blocked"?"blocked":"caution";
    effectiveAction=input.shadowAction;
    entry=Math.min(entry,60);
    applied=effectiveAction!==input.baseAction || permission!==input.baseTradingPermission;
    reasons.push("Context Gate CAUTION → 보수적 action/permission 적용");
  } else {
    // PASS는 공격적으로 승격하지 않는다. 기존 V2보다 위험을 늘리지 않는 단방향 안전 적용.
    permission=input.baseTradingPermission;
    effectiveAction=input.baseAction;
    reasons.push("Context Gate PASS → 기존 Decision V2 유지");
  }

  if(input.contextRiskScore>=80 && permission!=="blocked"){
    permission="caution"; entry=Math.min(entry,50); applied=true;
    if(effectiveAction==="strong_buy") effectiveAction="buy";
    if(effectiveAction==="sell") effectiveAction="reduce";
    reasons.push("Context risk >= 80 → 추가 보수화");
  }

  return {mode,baseAction:input.baseAction,effectiveAction,effectiveTradingPermission:permission,
    effectiveEntryQualityScore:Number(entry.toFixed(1)),applied,blockedByContext:blocked,reasons,
    strategyVersion:"phase8-context-activation-v8.5"};
}
