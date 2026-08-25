import type { Phase810TuningCandidate, Phase810TuningInput } from "./types";

const round=(v:number,d=2)=>Number(v.toFixed(d));
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

export function buildAdaptiveContextTuningCandidate(input:Phase810TuningInput):Phase810TuningCandidate{
  const reasons:string[]=[];
  const base={...input.current};

  if(!input.promotionEligible || input.performanceStatus!=="healthy"){
    reasons.push("Safety Promotion 미통과 또는 performance healthy 아님 → 후보 생성 차단");
    return {
      status:"blocked",
      candidate:base,
      deltas:{minimumSuccessRate:0,minimumAverageQualityScore:0,cautionMarginMultiplier:0},
      autoApplyAllowed:false,
      reasons,
      strategyVersion:"phase8-adaptive-context-tuning-v8.10",
    };
  }

  let successDelta=0;
  let qualityDelta=0;
  let marginDelta=0;

  const success=input.successRate??0;
  const quality=input.averageQualityScore??0;

  // 성과가 충분히 높으면 기준을 소폭 강화해 과도한 승격을 방지.
  if(success>=75) successDelta=2;
  else if(success<68) successDelta=-2;

  if(quality>=72) qualityDelta=2;
  else if(quality<63) qualityDelta=-2;

  // missed opportunity가 상대적으로 많으면 caution 진입 축소를 조금 완화.
  if(input.missedOpportunityCount>=5 && input.missedOpportunityCount>input.avoidedLossCount){
    marginDelta=0.05;
    reasons.push("missed opportunity 우세 → caution margin 후보를 소폭 완화");
  } else if(input.avoidedLossCount>=5 && input.avoidedLossCount>input.missedOpportunityCount*1.5){
    marginDelta=-0.05;
    reasons.push("avoided loss 우세 → caution margin 후보를 소폭 강화");
  }

  // 한 단계 최대 변화량 제한.
  successDelta=clamp(successDelta,-5,5);
  qualityDelta=clamp(qualityDelta,-5,5);
  marginDelta=clamp(marginDelta,-0.05,0.05);

  const candidate={
    minimumSuccessRate:round(clamp(base.minimumSuccessRate+successDelta,55,80),1),
    minimumAverageQualityScore:round(clamp(base.minimumAverageQualityScore+qualityDelta,50,80),1),
    cautionMarginMultiplier:round(clamp(base.cautionMarginMultiplier+marginDelta,0.25,0.75),2),
  };

  if(successDelta!==0) reasons.push(`success threshold 후보 ${successDelta>0?"+":""}${successDelta}`);
  if(qualityDelta!==0) reasons.push(`quality threshold 후보 ${qualityDelta>0?"+":""}${qualityDelta}`);
  if(marginDelta===0) reasons.push("caution margin 후보 변경 없음");
  reasons.push("후보값만 생성 · 자동 적용 금지");

  return {
    status:"candidate_ready",
    candidate,
    deltas:{
      minimumSuccessRate:round(candidate.minimumSuccessRate-base.minimumSuccessRate,1),
      minimumAverageQualityScore:round(candidate.minimumAverageQualityScore-base.minimumAverageQualityScore,1),
      cautionMarginMultiplier:round(candidate.cautionMarginMultiplier-base.cautionMarginMultiplier,2),
    },
    autoApplyAllowed:false,
    reasons,
    strategyVersion:"phase8-adaptive-context-tuning-v8.10",
  };
}
