import type { MarketRegime } from "../regime/types";

export type WeightComponent = "technical" | "news" | "funding" | "regime";

export interface AdvisorWeights {
  technical: number;
  news: number;
  funding: number;
  regime: number;
}

export interface ComponentPerformanceSample {
  evaluatedAt: string;
  marketReturn: number;
  technicalScore: number;
  newsScore: number;
  fundingScore: number;
}

export interface ComponentEvidence {
  component: WeightComponent;
  sampleCount: number;
  activeSignalCount: number;
  neutralSignalCount: number;
  directionalEvaluationCount: number;
  effectiveSampleSize: number;
  signalCoverage: number | null;
  weightedAccuracy: number | null;
  shrunkAccuracy: number | null;
  weightedCorrelation: number | null;
  averageDirectionalReturn: number | null;
  reliabilityScore: number | null;
  skillVsRandom: number | null;
  adjustment: number;
  eligibleForReallocation: boolean;
  note: string;
}

export interface WeightAdvisorInput {
  regime: MarketRegime;
  baseline: AdvisorWeights;
  samples: ComponentPerformanceSample[];
  now?: Date;
  minimumSamples?: number;
  minimumActiveSignals?: number;
}

export interface WeightAdvisorResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  regime: MarketRegime;
  baselineWeights: AdvisorWeights;
  candidateWeights: AdvisorWeights;
  recommendedWeights: AdvisorWeights;
  evidence: ComponentEvidence[];
  sampleCount: number;
  status: "insufficient_data" | "observation_only" | "advisory_ready";
  statusReason: string;
  maxAdjustment: number;
  validationSummary: {
    activeComponents: number;
    validatedComponents: number;
    regimePerformanceAvailable: boolean;
    autoApplySafe: boolean;
  };
  methodology: string[];
  strategyVersion: string;
}
