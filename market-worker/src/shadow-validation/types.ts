export type Direction = "bullish" | "neutral" | "bearish";
export type ValidationStatus = "validated" | "insufficient_signals" | "distribution_saturated";

export interface SignalMetric {
  signalCount: number;
  signalRate: number;
  bullishCount: number;
  bearishCount: number;
  accuracy1h: number | null;
  accuracy4h: number | null;
  accuracy24h: number | null;
  avgDirectionalReturn1h: number | null;
  avgDirectionalReturn4h: number | null;
  avgDirectionalReturn24h: number | null;
}

export interface NewsShadowResult {
  calibrationSamples: number;
  validationSamples: number;
  legacyThresholds: { bearish: number; bullish: number };
  candidateThresholds: { bearish: number; bullish: number };
  legacy: SignalMetric;
  candidate: SignalMetric;
  candidateStatus: ValidationStatus;
  verdict: "candidate_better" | "legacy_better" | "inconclusive";
  reasons: string[];
}

export interface FundingShadowResult {
  calibrationSamples: number;
  validationSamples: number;
  p10BasisPoints: number | null;
  medianBasisPoints: number | null;
  p90BasisPoints: number | null;
  maxBasisPoints: number | null;
  saturationRatioAtMax: number;
  legacy: SignalMetric;
  crowdingCandidate: SignalMetric;
  candidateStatus: ValidationStatus;
  verdict: "crowding_better" | "legacy_better" | "inconclusive";
  reasons: string[];
}

export interface ShadowValidationResult {
  symbol: string;
  calculatedAt: string;
  windowHours: number;
  calibrationRatio: number;
  validationReturnThresholdPercent: number;
  news: NewsShadowResult;
  funding: FundingShadowResult;
  overallVerdict: "candidate_promising" | "keep_observation" | "insufficient_evidence";
  recommendations: string[];
  strategyVersion: string;
  saved?: boolean;
}
