export type SizingRiskTier = "blocked" | "conservative" | "normal" | "strong";

export interface AdaptiveSizingInput {
  accountEquity: number;
  triggerStatus: "WATCH" | "RE_EVALUATE" | "READY" | "INVALIDATED" | "UNAVAILABLE";
  direction: "bullish" | "neutral" | "bearish";
  entryQualityScore: number;
  directionStrength: number;
  regimeConfidence: number;
  dataReliability: number;
  overheatRisk: number;
  reversalRisk: number;
  fundingCrowdingRisk: number;
  tradingPermission: "allowed" | "caution" | "blocked";
  stopLossDistancePercent: number;
}

export interface AdaptiveSizingPlan {
  status: "blocked" | "candidate_ready";
  riskTier: SizingRiskTier;
  marginPercent: number;
  leverage: number;
  effectiveExposureMultiple: number;
  effectiveExposurePercent: number;
  marginAmount: number;
  notionalAmount: number;
  maxAccountRiskPercent: number;
  estimatedStopLossRiskPercent: number;
  estimatedStopLossAmount: number;
  sizingScore: number;
  capsApplied: string[];
  blockers: string[];
  reasons: string[];
  strategyVersion: "adaptive-position-sizing-v7.7";
}
