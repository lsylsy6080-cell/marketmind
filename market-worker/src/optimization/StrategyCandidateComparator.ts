import {
  analyzeStrategyPerformance,
  type ClosedTradeSample,
  type SampleStatus,
} from "./StrategyPerformanceAnalyzer";

export type CandidateKind = "conservative" | "balanced" | "aggressive";

export interface StrategyCandidate {
  key: string;
  name: string;
  kind: CandidateKind;
  longScoreMin: number;
  shortScoreMax: number;
  confidenceMin: number;
  positionSizePercent: number;
  feeRatePercent: number;
  slippagePercent: number;
}

export interface HistoricalDecisionObservation {
  id: number;
  decidedAt: string;
  finalScore: number;
  finalConfidence: number;
  direction: "bullish" | "neutral" | "bearish";
  action: "strong_buy" | "buy" | "wait" | "reduce" | "sell";
  tradingPermission: "allowed" | "caution" | "blocked";
  marketReturnPercent: number;
}

export interface CandidateComparisonResult {
  candidate: StrategyCandidate;
  observationCount: number;
  selectedTrades: number;
  skippedObservations: number;
  selectionRate: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number | null;
  expectedReturnPercent: number | null;
  cumulativeReturnPercent: number;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  sampleStatus: SampleStatus;
  optimizationEligible: boolean;
}

export const DEFAULT_STRATEGY_CANDIDATES: readonly StrategyCandidate[] = [
  {
    key: "conservative-v1",
    name: "보수형",
    kind: "conservative",
    longScoreMin: 68,
    shortScoreMax: 32,
    confidenceMin: 70,
    positionSizePercent: 10,
    feeRatePercent: 0.04,
    slippagePercent: 0.02,
  },
  {
    key: "balanced-v1",
    name: "균형형",
    kind: "balanced",
    longScoreMin: 60,
    shortScoreMax: 40,
    confidenceMin: 60,
    positionSizePercent: 20,
    feeRatePercent: 0.04,
    slippagePercent: 0.02,
  },
  {
    key: "aggressive-v1",
    name: "공격형",
    kind: "aggressive",
    longScoreMin: 55,
    shortScoreMax: 45,
    confidenceMin: 50,
    positionSizePercent: 30,
    feeRatePercent: 0.04,
    slippagePercent: 0.02,
  },
] as const;

function round(value: number, digits = 6): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function validateCandidate(candidate: StrategyCandidate): void {
  const values = [
    candidate.longScoreMin,
    candidate.shortScoreMax,
    candidate.confidenceMin,
    candidate.positionSizePercent,
    candidate.feeRatePercent,
    candidate.slippagePercent,
  ];

  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${candidate.key} 후보 설정에 잘못된 숫자가 있습니다.`);
  }

  if (
    candidate.shortScoreMax >= candidate.longScoreMin ||
    candidate.shortScoreMax < 0 ||
    candidate.longScoreMin > 100 ||
    candidate.confidenceMin < 0 ||
    candidate.confidenceMin > 100 ||
    candidate.positionSizePercent <= 0 ||
    candidate.positionSizePercent > 100 ||
    candidate.feeRatePercent < 0 ||
    candidate.slippagePercent < 0
  ) {
    throw new Error(`${candidate.key} 후보 설정 범위가 올바르지 않습니다.`);
  }
}

function validateObservation(observation: HistoricalDecisionObservation): void {
  if (
    !Number.isInteger(observation.id) ||
    observation.id <= 0 ||
    !Number.isFinite(observation.finalScore) ||
    !Number.isFinite(observation.finalConfidence) ||
    !Number.isFinite(observation.marketReturnPercent) ||
    !Number.isFinite(Date.parse(observation.decidedAt))
  ) {
    throw new Error(`observation_id=${observation.id} 값이 올바르지 않습니다.`);
  }
}

function getPositionSide(
  candidate: StrategyCandidate,
  observation: HistoricalDecisionObservation,
): "long" | "short" | null {
  if (
    observation.tradingPermission === "blocked" ||
    observation.finalConfidence < candidate.confidenceMin
  ) {
    return null;
  }

  if (
    observation.direction === "bullish" &&
    (observation.action === "strong_buy" || observation.action === "buy") &&
    observation.finalScore >= candidate.longScoreMin
  ) {
    return "long";
  }

  if (
    observation.direction === "bearish" &&
    (observation.action === "reduce" || observation.action === "sell") &&
    observation.finalScore <= candidate.shortScoreMax
  ) {
    return "short";
  }

  return null;
}

function simulateCandidateTrade(
  candidate: StrategyCandidate,
  observation: HistoricalDecisionObservation,
): ClosedTradeSample | null {
  const side = getPositionSide(candidate, observation);
  if (!side) return null;

  const directionalReturn =
    side === "long"
      ? observation.marketReturnPercent
      : -observation.marketReturnPercent;
  const allocation = candidate.positionSizePercent / 100;
  const roundTripCost =
    (candidate.feeRatePercent + candidate.slippagePercent) * 2;
  const strategyReturn = (directionalReturn - roundTripCost) * allocation;

  return {
    id: observation.id,
    netPnl: round(strategyReturn),
    returnPercent: round(strategyReturn),
    closedAt: observation.decidedAt,
  };
}

export function compareStrategyCandidate(
  candidate: StrategyCandidate,
  observations: readonly HistoricalDecisionObservation[],
): CandidateComparisonResult {
  validateCandidate(candidate);
  observations.forEach(validateObservation);

  const trades = observations
    .map((observation) => simulateCandidateTrade(candidate, observation))
    .filter((trade): trade is ClosedTradeSample => trade !== null);
  const metrics = analyzeStrategyPerformance(trades);

  return {
    candidate,
    observationCount: observations.length,
    selectedTrades: metrics.totalTrades,
    skippedObservations: observations.length - metrics.totalTrades,
    selectionRate:
      observations.length > 0
        ? round((metrics.totalTrades / observations.length) * 100)
        : 0,
    winningTrades: metrics.winningTrades,
    losingTrades: metrics.losingTrades,
    winRate: metrics.winRate,
    expectedReturnPercent: metrics.averageReturnPercent,
    cumulativeReturnPercent: metrics.netPnl,
    profitFactor: metrics.profitFactor,
    maxDrawdownPercent: metrics.maxDrawdownPercent,
    sampleStatus: metrics.sampleStatus,
    optimizationEligible: metrics.optimizationEligible,
  };
}

export function compareStrategyCandidates(
  observations: readonly HistoricalDecisionObservation[],
  candidates: readonly StrategyCandidate[] = DEFAULT_STRATEGY_CANDIDATES,
): CandidateComparisonResult[] {
  const keys = new Set<string>();

  for (const candidate of candidates) {
    if (keys.has(candidate.key)) {
      throw new Error(`중복 전략 후보 키가 있습니다: ${candidate.key}`);
    }
    keys.add(candidate.key);
  }

  return candidates.map((candidate) =>
    compareStrategyCandidate(candidate, observations),
  );
}
