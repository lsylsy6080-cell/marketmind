import type { Phase811RollbackInput, Phase811RollbackResult } from "./types";

const MIN_POST_APPLY_SAMPLES=20;
const round=(v:number,d=2)=>Number(v.toFixed(d));

export function evaluateAutoRollbackProtection(input:Phase811RollbackInput):Phase811RollbackResult{
  const successDrop=
    input.baseline.successRate==null || input.current.successRate==null
      ? null
      : round(input.baseline.successRate-input.current.successRate);

  const qualityDrop=
    input.baseline.averageQualityScore==null || input.current.averageQualityScore==null
      ? null
      : round(input.baseline.averageQualityScore-input.current.averageQualityScore);

  const reasons:string[]=[];

  if(!input.tuningApplied){
    reasons.push("실제 적용된 튜닝 없음 → rollback protection 대기");
    return {
      status:"not_armed",rollbackRecommended:false,
      successRateDrop:successDrop,qualityScoreDrop:qualityDrop,
      minimumPostApplySamples:MIN_POST_APPLY_SAMPLES,reasons,
      autoRollbackAllowed:false,
      strategyVersion:"phase8-auto-rollback-protection-v8.11",
    };
  }

  if(input.current.sampleCount<MIN_POST_APPLY_SAMPLES){
    reasons.push(`적용 후 표본 부족 · ${input.current.sampleCount}/${MIN_POST_APPLY_SAMPLES}`);
    return {
      status:"monitoring",rollbackRecommended:false,
      successRateDrop:successDrop,qualityScoreDrop:qualityDrop,
      minimumPostApplySamples:MIN_POST_APPLY_SAMPLES,reasons,
      autoRollbackAllowed:false,
      strategyVersion:"phase8-auto-rollback-protection-v8.11",
    };
  }

  let rollback=false;

  if(input.current.status==="degraded"){
    rollback=true;
    reasons.push("현재 Context Performance가 degraded");
  }
  if(successDrop!=null && successDrop>=10){
    rollback=true;
    reasons.push(`성공률 ${successDrop}%p 하락 ≥ 10%p`);
  }
  if(qualityDrop!=null && qualityDrop>=8){
    rollback=true;
    reasons.push(`평균 품질 ${qualityDrop} 하락 ≥ 8`);
  }

  if(
    input.current.missedOpportunityCount>=5 &&
    input.current.missedOpportunityCount>input.current.avoidedLossCount*2
  ){
    rollback=true;
    reasons.push("missed opportunity가 avoided loss 대비 2배 초과");
  }

  if(!rollback) reasons.push("Rollback 임계값 미충족 · 현재 설정 유지");

  return {
    status:rollback?"rollback_required":"stable",
    rollbackRecommended:rollback,
    successRateDrop:successDrop,
    qualityScoreDrop:qualityDrop,
    minimumPostApplySamples:MIN_POST_APPLY_SAMPLES,
    reasons,
    autoRollbackAllowed:false,
    strategyVersion:"phase8-auto-rollback-protection-v8.11",
  };
}
