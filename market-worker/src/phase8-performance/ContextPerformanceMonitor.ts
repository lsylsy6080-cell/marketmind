import type { ContextOutcomeSample, Phase88ContextPerformanceResult } from "./types";

const round=(v:number,d=2)=>Number(v.toFixed(d));

export function evaluateContextPerformance(samples:ContextOutcomeSample[]):Phase88ContextPerformanceResult{
  const positive=new Set(["good_entry","avoided_loss","protected"]);
  const negative=new Set(["bad_entry","missed_opportunity"]);

  const positiveCount=samples.filter(x=>positive.has(x.label)).length;
  const negativeCount=samples.filter(x=>negative.has(x.label)).length;
  const neutralCount=samples.filter(x=>x.label==="neutral").length;
  const decisiveSampleCount=positiveCount+negativeCount;
  const successRate=decisiveSampleCount>0 ? round(positiveCount/decisiveSampleCount*100) : null;
  const avgQuality=samples.length ? round(samples.reduce((s,x)=>s+x.qualityScore,0)/samples.length) : null;
  const avgReturn=samples.length ? round(samples.reduce((s,x)=>s+x.directionalReturnPercent,0)/samples.length,4) : null;
  const avoidedLossCount=samples.filter(x=>x.label==="avoided_loss").length;
  const missedOpportunityCount=samples.filter(x=>x.label==="missed_opportunity").length;

  let status:Phase88ContextPerformanceResult["status"]="collecting";
  const reasons:string[]=[];

  if(samples.length<30 || decisiveSampleCount<20){
    status="collecting";
    reasons.push(`표본 수집 중 · total=${samples.length}, decisive=${decisiveSampleCount}`);
  }else if((successRate??0)>=65 && (avgQuality??0)>=60){
    status="healthy";
    reasons.push("Context Guard 성과가 안정 기준을 충족");
  }else if((successRate??0)>=50){
    status="caution";
    reasons.push("성과가 중립권 · 자동 튜닝 없이 추가 관찰");
  }else{
    status="degraded";
    reasons.push("Context Guard 성과 저하 · 자동 튜닝 금지");
  }

  if(missedOpportunityCount>avoidedLossCount*2 && missedOpportunityCount>=5){
    if(status==="healthy") status="caution";
    reasons.push("missed opportunity가 avoided loss 대비 과다");
  }

  return {
    sampleCount:samples.length,
    decisiveSampleCount,
    positiveCount,
    negativeCount,
    neutralCount,
    successRate,
    averageQualityScore:avgQuality,
    averageDirectionalReturnPercent:avgReturn,
    avoidedLossCount,
    missedOpportunityCount,
    status,
    autoTuningAllowed:false,
    reasons,
    strategyVersion:"phase8-context-performance-v8.8",
  };
}
