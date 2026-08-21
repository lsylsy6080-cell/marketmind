import type { AdaptiveSizingInput, AdaptiveSizingPlan } from "./types";

const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=4)=>{const m=10**d;return Math.round(v*m)/m};

export function calculateAdaptivePositionSizing(input:AdaptiveSizingInput):AdaptiveSizingPlan {
  const blockers:string[]=[];
  const capsApplied:string[]=[];
  const reasons:string[]=[];

  if(input.triggerStatus!=="READY") blockers.push(`Entry Trigger ${input.triggerStatus} — READY가 아닙니다.`);
  if(input.direction==="neutral") blockers.push("방향성이 neutral입니다.");
  if(input.tradingPermission==="blocked") blockers.push("거래 권한이 blocked입니다.");
  if(input.accountEquity<=0 || !Number.isFinite(input.accountEquity)) blockers.push("유효한 계좌 Equity가 없습니다.");
  if(input.stopLossDistancePercent<=0 || !Number.isFinite(input.stopLossDistancePercent)) blockers.push("유효한 손절 거리 정보가 없습니다.");

  const positive =
    input.entryQualityScore*0.30 +
    input.directionStrength*0.22 +
    input.regimeConfidence*0.18 +
    input.dataReliability*0.16;
  const negative =
    input.overheatRisk*0.08 +
    input.reversalRisk*0.04 +
    input.fundingCrowdingRisk*0.02;
  const sizingScore=round(clamp(positive-negative,0,100),2);

  if(blockers.length){
    return {
      status:"blocked",riskTier:"blocked",marginPercent:0,leverage:0,
      effectiveExposureMultiple:0,effectiveExposurePercent:0,marginAmount:0,notionalAmount:0,
      maxAccountRiskPercent:0,estimatedStopLossRiskPercent:0,estimatedStopLossAmount:0,
      sizingScore,capsApplied,blockers,reasons:["Sizing은 READY 진입에서만 활성화합니다."],
      strategyVersion:"adaptive-position-sizing-v7.7",
    };
  }

  let marginPercent:number;
  let leverage:number;
  let riskTier:AdaptiveSizingPlan["riskTier"];
  let maxRisk:number;

  if(sizingScore<62){
    marginPercent=5; leverage=2; riskTier="conservative"; maxRisk=0.50;
  }else if(sizingScore<72){
    marginPercent=7.5; leverage=3; riskTier="conservative"; maxRisk=0.65;
  }else if(sizingScore<82){
    marginPercent=10; leverage=4; riskTier="normal"; maxRisk=0.80;
  }else if(sizingScore<90){
    marginPercent=12.5; leverage=5; riskTier="strong"; maxRisk=0.90;
  }else{
    marginPercent=15; leverage=6; riskTier="strong"; maxRisk=1.00;
  }

  // Safety penalties: confidence가 좋아도 과열/반전위험이 높으면 크기를 자동 축소.
  if(input.overheatRisk>55){ leverage=Math.max(2,leverage-2); marginPercent=Math.max(5,marginPercent-2.5); reasons.push("과열 >55로 증거금/레버리지를 축소했습니다.");}
  if(input.reversalRisk>55){ leverage=Math.max(2,leverage-1); marginPercent=Math.max(5,marginPercent-2.5); reasons.push("반전 위험 >55로 포지션 크기를 축소했습니다.");}
  if(input.tradingPermission==="caution"){ leverage=Math.min(leverage,3); marginPercent=Math.min(marginPercent,7.5); maxRisk=Math.min(maxRisk,0.6); reasons.push("거래 권한 caution으로 보수적 상한을 적용했습니다.");}
  if(input.fundingCrowdingRisk>=70){ leverage=Math.min(leverage,3); reasons.push("Funding crowding 위험으로 레버리지를 제한했습니다.");}

  // 초기 검증 단계의 절대 안전 상한.
  if(marginPercent>15){marginPercent=15;capsApplied.push("margin_cap_15pct");}
  if(leverage>6){leverage=6;capsApplied.push("leverage_cap_6x");}

  let exposureMultiple=(marginPercent/100)*leverage;
  if(exposureMultiple>1.0){
    leverage=Math.max(1,Math.floor(1.0/(marginPercent/100)));
    exposureMultiple=(marginPercent/100)*leverage;
    capsApplied.push("effective_exposure_cap_1.0x");
  }

  // Risk budget: 손절 시 계좌 손실이 risk tier 상한을 넘지 않게 notional을 역산.
  const rawRiskPct=exposureMultiple*input.stopLossDistancePercent;
  if(rawRiskPct>maxRisk){
    const allowedExposure=maxRisk/input.stopLossDistancePercent;
    const maxLevByRisk=Math.max(1,Math.floor(allowedExposure/(marginPercent/100)));
    leverage=Math.max(1,Math.min(leverage,maxLevByRisk));
    exposureMultiple=(marginPercent/100)*leverage;

    // 1x까지 낮춰도 Risk Budget을 넘으면 증거금 자체도 줄인다.
    if(exposureMultiple*input.stopLossDistancePercent>maxRisk){
      const maxMarginPercent=(maxRisk/input.stopLossDistancePercent/leverage)*100;
      marginPercent=Math.max(1,Math.min(marginPercent,maxMarginPercent));
      exposureMultiple=(marginPercent/100)*leverage;
      capsApplied.push("margin_reduced_by_risk_budget");
    }
    capsApplied.push("stop_loss_risk_budget");
  }

  const estimatedRiskPct=round(exposureMultiple*input.stopLossDistancePercent,4);
  const marginAmount=round(input.accountEquity*(marginPercent/100),4);
  const notionalAmount=round(marginAmount*leverage,4);
  const estimatedRiskAmount=round(input.accountEquity*(estimatedRiskPct/100),4);

  reasons.push(`Sizing score ${sizingScore}/100 → ${riskTier} tier.`);
  reasons.push(`증거금 ${round(marginPercent,2)}% × ${leverage}x = 유효 노출 ${round(exposureMultiple,3)}x.`);
  reasons.push(`손절거리 ${round(input.stopLossDistancePercent,3)}% 기준 예상 계좌 Risk ${estimatedRiskPct}% (상한 ${maxRisk}%).`);

  return {
    status:"candidate_ready",riskTier,marginPercent:round(marginPercent,2),leverage,
    effectiveExposureMultiple:round(exposureMultiple,4),
    effectiveExposurePercent:round(exposureMultiple*100,2),
    marginAmount,notionalAmount,maxAccountRiskPercent:maxRisk,
    estimatedStopLossRiskPercent:estimatedRiskPct,
    estimatedStopLossAmount:estimatedRiskAmount,
    sizingScore,capsApplied,blockers,reasons,
    strategyVersion:"adaptive-position-sizing-v7.7",
  };
}
