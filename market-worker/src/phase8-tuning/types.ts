export interface Phase810TuningInput {
  promotionEligible: boolean;
  performanceStatus: "collecting" | "healthy" | "caution" | "degraded";
  successRate: number | null;
  averageQualityScore: number | null;
  avoidedLossCount: number;
  missedOpportunityCount: number;
  current: {
    minimumSuccessRate: number;
    minimumAverageQualityScore: number;
    cautionMarginMultiplier: number;
  };
}

export interface Phase810TuningCandidate {
  status: "blocked" | "candidate_ready";
  candidate: {
    minimumSuccessRate: number;
    minimumAverageQualityScore: number;
    cautionMarginMultiplier: number;
  };
  deltas: {
    minimumSuccessRate: number;
    minimumAverageQualityScore: number;
    cautionMarginMultiplier: number;
  };
  autoApplyAllowed: false;
  reasons: string[];
  strategyVersion: "phase8-adaptive-context-tuning-v8.10";
}
