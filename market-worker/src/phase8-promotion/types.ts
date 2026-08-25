export type PromotionStatus =
  | "collecting"
  | "not_eligible"
  | "eligible_for_tuning";

export interface Phase89PromotionInput {
  sampleCount: number;
  decisiveSampleCount: number;
  successRate: number | null;
  averageQualityScore: number | null;
  avoidedLossCount: number;
  missedOpportunityCount: number;
  performanceStatus: "collecting" | "healthy" | "caution" | "degraded";
}

export interface Phase89PromotionResult {
  status: PromotionStatus;
  eligible: boolean;
  minimumSampleCount: number;
  minimumDecisiveSampleCount: number;
  minimumSuccessRate: number;
  minimumAverageQualityScore: number;
  missedOpportunityRatio: number | null;
  reasons: string[];
  autoApplyAllowed: false;
  strategyVersion: "phase8-safety-promotion-v8.9";
}
