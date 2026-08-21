export type BattleDirection = "bullish" | "neutral" | "bearish";
export type BattleAction = "strong_buy" | "buy" | "wait" | "reduce" | "sell";
export type BattlePermission = "allowed" | "caution" | "blocked";
export type BattleHorizon = "1h" | "4h" | "24h";

export interface BattleDecision {
  engine: "v1" | "v2";
  id: number;
  linkedV1DecisionId: number;
  decidedAt: string;
  direction: BattleDirection;
  action: BattleAction;
  tradingPermission: BattlePermission;
  finalScore: number;
  finalConfidence: number;
  strategyVersion: string;
  regime?: string | null;
  overheatRisk?: number | null;
  entryQualityScore?: number | null;
  preferredEntry?: string | null;
  newsLimitedApplied?: boolean;
  fundingCrowdingStatus?: string | null;
}

export interface BattleForwardReturns {
  "1h": number | null;
  "4h": number | null;
  "24h": number | null;
}

export interface BattlePair {
  v1: BattleDecision;
  v2: BattleDecision;
  returns: BattleForwardReturns;
  pairingLagMinutes: number;
}

export interface EngineHorizonMetrics {
  evaluated: number;
  directionCorrect: number;
  directionIncorrect: number;
  directionNeutral: number;
  directionAccuracy: number | null;
  avgDirectionalReturn: number | null;
  actionCorrect: number;
  actionIncorrect: number;
  actionNeutral: number;
  actionIgnored: number;
  actionAccuracy: number | null;
  buySignals: number;
  sellSignals: number;
  waitSignals: number;
}

export interface WaitMetrics {
  waits: number;
  evaluated: number;
  avoidedBadEntry: number;
  missedOpportunity: number;
  correctNeutralWait: number;
  ambiguous: number;
  avoidanceRate: number | null;
}

export interface BattleHorizonComparison {
  horizon: BattleHorizon;
  comparablePairs: number;
  v1: EngineHorizonMetrics;
  v2: EngineHorizonMetrics;
  v2Wait: WaitMetrics;
  directionAccuracyDelta: number | null;
  directionalReturnDelta: number | null;
  actionAccuracyDelta: number | null;
  winner: "v1" | "v2" | "tie" | "inconclusive";
}

export interface SegmentMetrics {
  segment: string;
  pairs: number;
  oneHour: BattleHorizonComparison | null;
  fourHour: BattleHorizonComparison | null;
  twentyFourHour: BattleHorizonComparison | null;
}

export interface PerformanceBattleResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  pairing: {
    candidateV2Snapshots: number;
    linkedPairs: number;
    excludedLaggedPairs: number;
    maxPairingLagMinutes: number;
  };
  overall: BattleHorizonComparison[];
  regimes: SegmentMetrics[];
  v2Diagnostics: {
    overheatGuard: SegmentMetrics | null;
    pullbackWait: SegmentMetrics | null;
    newsLimited: SegmentMetrics | null;
    fundingCrowdingActive: SegmentMetrics | null;
  };
  verdict: "v1_leads" | "v2_leads" | "mixed" | "inconclusive";
  verdictReason: string;
  minimumPairsForWinner: number;
  methodology: string[];
  strategyVersion: "performance-battle-v2.4";
}
