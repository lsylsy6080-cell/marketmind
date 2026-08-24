export type SqueezeWarningPhase =
  | "WATCH"
  | "BUILDING"
  | "IMMINENT"
  | "ACTIVE"
  | "EXHAUSTION";

export type SqueezeWarningSide = "long_squeeze" | "short_squeeze";

export type SqueezeResponse =
  | "observe"
  | "avoid_chasing"
  | "tighten_risk"
  | "reduce_opposite_exposure"
  | "defensive_exit"
  | "wait_for_reset";

export interface SqueezeWarningAssessment {
  side: SqueezeWarningSide;
  phase: SqueezeWarningPhase;
  probability: number;
  previousProbability: number | null;
  probabilityDelta: number | null;
  persistenceCount: number;
  momentumScore: number;
  confirmationScore: number;
  zonePressureScore: number;
  alertScore: number;
  recommendedResponse: SqueezeResponse;
  reasons: string[];
}

export interface SqueezeEarlyWarningResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  currentPrice: number;
  longSqueeze: SqueezeWarningAssessment;
  shortSqueeze: SqueezeWarningAssessment;
  dominantWarning: SqueezeWarningSide | "balanced";
  strategyVersion: "squeeze-early-warning-v7.15";
}
