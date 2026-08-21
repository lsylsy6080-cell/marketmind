export type CalibrationStatus = "candidate_ready" | "insufficient_data" | "source_inactive";
export type NewsDirection = "bullish" | "neutral" | "bearish";
export type CrowdingSide = "long_crowded" | "balanced" | "short_crowded";
export type ContrarianBias = "bullish" | "neutral" | "bearish";

export interface NewsCalibrationCandidate {
  sampleCount: number;
  scoreMin: number | null;
  scoreMax: number | null;
  scoreMean: number | null;
  scoreStdDev: number | null;
  bearishThreshold: number | null;
  bullishThreshold: number | null;
  expectedBearishRate: number;
  expectedNeutralRate: number;
  expectedBullishRate: number;
  actualSpread: number | null;
  minimumSpreadRequired: number;
  status: CalibrationStatus;
  reason: string;
}

export interface FundingCrowdingCandidate {
  sampleCount: number;
  currentFundingBasisPoints: number | null;
  signedPercentile: number | null;
  absolutePercentile: number | null;
  crowdingSide: CrowdingSide;
  crowdingRisk: number;
  contrarianBias: ContrarianBias;
  contrarianAdjustment: number;
  p10BasisPoints: number | null;
  medianBasisPoints: number | null;
  p90BasisPoints: number | null;
  p90AbsoluteBasisPoints: number | null;
  status: CalibrationStatus;
  reason: string;
}

export interface SignalCalibrationResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  windowHours: number;
  mode: "observation_only";
  news: NewsCalibrationCandidate;
  funding: FundingCrowdingCandidate;
  recommendations: string[];
  strategyVersion: "signal-calibration-v2.3a3";
}
