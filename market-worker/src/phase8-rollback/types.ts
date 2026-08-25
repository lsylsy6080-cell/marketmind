export type RollbackStatus =
  | "not_armed"
  | "monitoring"
  | "stable"
  | "rollback_required";

export interface RollbackPerformancePoint {
  sampleCount: number;
  successRate: number | null;
  averageQualityScore: number | null;
  missedOpportunityCount: number;
  avoidedLossCount: number;
  status: "collecting" | "healthy" | "caution" | "degraded";
}

export interface Phase811RollbackInput {
  tuningApplied: boolean;
  baseline: RollbackPerformancePoint;
  current: RollbackPerformancePoint;
}

export interface Phase811RollbackResult {
  status: RollbackStatus;
  rollbackRecommended: boolean;
  successRateDrop: number | null;
  qualityScoreDrop: number | null;
  minimumPostApplySamples: number;
  reasons: string[];
  autoRollbackAllowed: false;
  strategyVersion: "phase8-auto-rollback-protection-v8.11";
}
