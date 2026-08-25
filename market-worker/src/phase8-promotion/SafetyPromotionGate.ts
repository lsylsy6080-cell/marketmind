import type { Phase89PromotionInput, Phase89PromotionResult } from "./types";

const MIN_SAMPLE=30;
const MIN_DECISIVE=20;
const MIN_SUCCESS_RATE=65;
const MIN_AVG_QUALITY=60;

export function evaluateSafetyPromotion(input:Phase89PromotionInput):Phase89PromotionResult{
  const reasons:string[]=[];
  const ratio=input.avoidedLossCount>0
    ? Number((input.missedOpportunityCount/input.avoidedLossCount).toFixed(2))
    : input.missedOpportunityCount>0 ? null : 0;

  if(input.sampleCount<MIN_SAMPLE || input.decisiveSampleCount<MIN_DECISIVE){
    reasons.push(`표본 부족 · total=${input.sampleCount}/${MIN_SAMPLE}, decisive=${input.decisiveSampleCount}/${MIN_DECISIVE}`);
    return {
      status:"collecting",eligible:false,
      minimumSampleCount:MIN_SAMPLE,minimumDecisiveSampleCount:MIN_DECISIVE,
      minimumSuccessRate:MIN_SUCCESS_RATE,minimumAverageQualityScore:MIN_AVG_QUALITY,
      missedOpportunityRatio:ratio,reasons,autoApplyAllowed:false,
      strategyVersion:"phase8-safety-promotion-v8.9",
    };
  }

  if(input.performanceStatus!=="healthy"){
    reasons.push(`8-8 performance status=${input.performanceStatus} → 승격 금지`);
  }
  if((input.successRate??0)<MIN_SUCCESS_RATE){
    reasons.push(`성공률 부족 · ${input.successRate??0}% < ${MIN_SUCCESS_RATE}%`);
  }
  if((input.averageQualityScore??0)<MIN_AVG_QUALITY){
    reasons.push(`평균 품질 부족 · ${input.averageQualityScore??0} < ${MIN_AVG_QUALITY}`);
  }
  if(input.missedOpportunityCount>=5 && input.missedOpportunityCount>input.avoidedLossCount*2){
    reasons.push("missed opportunity가 avoided loss 대비 과다");
  }

  const eligible=reasons.length===0;
  if(eligible) reasons.push("모든 Safety Promotion 기준 통과 · 튜닝 후보 승격");

  return {
    status:eligible?"eligible_for_tuning":"not_eligible",
    eligible,
    minimumSampleCount:MIN_SAMPLE,
    minimumDecisiveSampleCount:MIN_DECISIVE,
    minimumSuccessRate:MIN_SUCCESS_RATE,
    minimumAverageQualityScore:MIN_AVG_QUALITY,
    missedOpportunityRatio:ratio,
    reasons,
    autoApplyAllowed:false,
    strategyVersion:"phase8-safety-promotion-v8.9",
  };
}
