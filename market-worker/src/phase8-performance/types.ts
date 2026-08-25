import type { OutcomeLabel } from "../phase8-outcome/types";

export type ContextPerformanceStatus = "collecting" | "healthy" | "caution" | "degraded";

export interface ContextOutcomeSample {
  label: OutcomeLabel;
  qualityScore: number;
  directionalReturnPercent: number;
  permission: "allowed" | "reduced" | "blocked";
}

export interface Phase88ContextPerformanceResult {
  sampleCount: number;
  decisiveSampleCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  successRate: number | null;
  averageQualityScore: number | null;
  averageDirectionalReturnPercent: number | null;
  avoidedLossCount: number;
  missedOpportunityCount: number;
  status: ContextPerformanceStatus;
  autoTuningAllowed: false;
  reasons: string[];
  strategyVersion: "phase8-context-performance-v8.8";
}
