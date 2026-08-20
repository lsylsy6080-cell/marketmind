export type SampleStatus = "insufficient" | "provisional" | "ready";
export type PositionSide = "long" | "short";

export interface ClosedTradeSample {
  id: number;
  netPnl: number;
  returnPercent: number;
  closedAt: string;
  side?: PositionSide | null;
  entryConfidence?: number | null;
  holdingSeconds?: number | null;
  closeReason?: string | null;
  mfePercent?: number | null;
  maePercent?: number | null;
}

export interface SampleThresholds {
  provisionalTrades: number;
  readyTrades: number;
}

export interface PerformanceBreakdown {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number | null;
  netPnl: number;
  averagePnl: number | null;
  averageReturnPercent: number | null;
  profitFactor: number | null;
}

export interface SidePerformanceBreakdown extends PerformanceBreakdown {
  side: PositionSide;
}

export interface ConfidencePerformanceBreakdown extends PerformanceBreakdown {
  bucket: string;
  minConfidence: number;
  maxConfidence: number;
}

export interface ExitReasonPerformanceBreakdown extends PerformanceBreakdown {
  reason: string;
}

export interface HoldingTimeMetrics {
  samples: number;
  averageSeconds: number | null;
  minSeconds: number | null;
  maxSeconds: number | null;
}

export interface ExcursionDistributionBucket {
  bucket: string;
  minPercent: number;
  maxPercent: number | null;
  trades: number;
  rate: number | null;
}

export interface ExcursionMetrics {
  samples: number;
  averageMfePercent: number | null;
  medianMfePercent: number | null;
  p25MfePercent: number | null;
  p75MfePercent: number | null;
  maxMfePercent: number | null;
  averageMaePercent: number | null;
  medianMaePercent: number | null;
  p25MaePercent: number | null;
  p75MaePercent: number | null;
  minMaePercent: number | null;
  tpTargetPercent: number;
  slTargetPercent: number;
  tpReachTrades: number;
  tpReachRate: number | null;
  slReachTrades: number;
  slReachRate: number | null;
  breakEvenActivationPercent: number;
  breakEvenOpportunityTrades: number;
  breakEvenOpportunityRate: number | null;
  trailingActivationPercent: number;
  trailingOpportunityTrades: number;
  trailingOpportunityRate: number | null;
  mfeDistribution: ExcursionDistributionBucket[];
  maeDistribution: ExcursionDistributionBucket[];
}

export interface ExcursionTargets {
  takeProfitPercent: number;
  stopLossPercent: number;
}

export interface StrategyPerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number | null;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  averagePnl: number | null;
  averageReturnPercent: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  payoffRatio: number | null;
  profitFactor: number | null;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  consecutiveWinsMax: number;
  consecutiveLossesMax: number;
  holdingTime: HoldingTimeMetrics;
  sidePerformance: SidePerformanceBreakdown[];
  confidencePerformance: ConfidencePerformanceBreakdown[];
  exitReasonPerformance: ExitReasonPerformanceBreakdown[];
  excursion: ExcursionMetrics;
  sampleStatus: SampleStatus;
  optimizationEligible: boolean;
  tradesUntilProvisional: number;
  tradesUntilReady: number;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  lastTradeId: number | null;
}

export const DEFAULT_SAMPLE_THRESHOLDS: SampleThresholds = {
  provisionalTrades: 30,
  readyTrades: 50,
};

const CONFIDENCE_BUCKETS = [
  { bucket: "0-49", min: 0, max: 49.999999 },
  { bucket: "50-59", min: 50, max: 59.999999 },
  { bucket: "60-69", min: 60, max: 69.999999 },
  { bucket: "70-79", min: 70, max: 79.999999 },
  { bucket: "80-89", min: 80, max: 89.999999 },
  { bucket: "90-100", min: 90, max: 100 },
] as const;

function round(value: number, digits = 6): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function validateThresholds(thresholds: SampleThresholds): void {
  if (
    !Number.isInteger(thresholds.provisionalTrades) ||
    !Number.isInteger(thresholds.readyTrades) ||
    thresholds.provisionalTrades <= 0 ||
    thresholds.readyTrades < thresholds.provisionalTrades
  ) {
    throw new Error(
      "표본 기준은 0보다 큰 정수이며 ready 기준이 provisional 기준 이상이어야 합니다.",
    );
  }
}

function validateAndSortSamples(
  samples: readonly ClosedTradeSample[],
): ClosedTradeSample[] {
  const ids = new Set<number>();

  const validated = samples.map((sample) => {
    if (!Number.isInteger(sample.id) || sample.id <= 0) {
      throw new Error(`거래 ID가 올바르지 않습니다: ${sample.id}`);
    }

    if (ids.has(sample.id)) {
      throw new Error(`중복 거래 ID가 있습니다: ${sample.id}`);
    }
    ids.add(sample.id);

    if (
      !Number.isFinite(sample.netPnl) ||
      !Number.isFinite(sample.returnPercent)
    ) {
      throw new Error(`trade_id=${sample.id} 손익 값이 올바르지 않습니다.`);
    }

    const closedAtMs = Date.parse(sample.closedAt);
    if (!Number.isFinite(closedAtMs)) {
      throw new Error(`trade_id=${sample.id} 청산 시간이 올바르지 않습니다.`);
    }

    if (sample.side != null && sample.side !== "long" && sample.side !== "short") {
      throw new Error(`trade_id=${sample.id} 포지션 방향이 올바르지 않습니다.`);
    }

    if (
      sample.entryConfidence != null &&
      (!Number.isFinite(sample.entryConfidence) ||
        sample.entryConfidence < 0 ||
        sample.entryConfidence > 100)
    ) {
      throw new Error(`trade_id=${sample.id} 진입 신뢰도가 올바르지 않습니다.`);
    }

    if (
      sample.holdingSeconds != null &&
      (!Number.isFinite(sample.holdingSeconds) || sample.holdingSeconds < 0)
    ) {
      throw new Error(`trade_id=${sample.id} 보유 시간이 올바르지 않습니다.`);
    }

    if (
      sample.mfePercent != null &&
      (!Number.isFinite(sample.mfePercent) || sample.mfePercent < 0)
    ) {
      throw new Error(`trade_id=${sample.id} MFE 값이 올바르지 않습니다.`);
    }

    if (
      sample.maePercent != null &&
      (!Number.isFinite(sample.maePercent) || sample.maePercent > 0)
    ) {
      throw new Error(`trade_id=${sample.id} MAE 값이 올바르지 않습니다.`);
    }

    return { ...sample };
  });

  return validated.sort((left, right) => {
    const timeDifference =
      Date.parse(left.closedAt) - Date.parse(right.closedAt);
    return timeDifference !== 0 ? timeDifference : left.id - right.id;
  });
}

function calculateBreakdown(
  samples: readonly ClosedTradeSample[],
): PerformanceBreakdown {
  const winning = samples.filter((trade) => trade.netPnl > 0);
  const losing = samples.filter((trade) => trade.netPnl < 0);
  const breakeven = samples.length - winning.length - losing.length;
  const decisiveTrades = winning.length + losing.length;
  const grossProfit = winning.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    losing.reduce((sum, trade) => sum + trade.netPnl, 0),
  );
  const netPnl = samples.reduce((sum, trade) => sum + trade.netPnl, 0);
  const totalReturn = samples.reduce(
    (sum, trade) => sum + trade.returnPercent,
    0,
  );

  return {
    totalTrades: samples.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    breakevenTrades: breakeven,
    winRate:
      decisiveTrades > 0 ? round((winning.length / decisiveTrades) * 100) : null,
    netPnl: round(netPnl),
    averagePnl: samples.length > 0 ? round(netPnl / samples.length) : null,
    averageReturnPercent:
      samples.length > 0 ? round(totalReturn / samples.length) : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
  };
}

function calculateHoldingTime(
  samples: readonly ClosedTradeSample[],
): HoldingTimeMetrics {
  const values = samples
    .map((trade) => trade.holdingSeconds)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (values.length === 0) {
    return {
      samples: 0,
      averageSeconds: null,
      minSeconds: null,
      maxSeconds: null,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    samples: values.length,
    averageSeconds: round(total / values.length),
    minSeconds: round(Math.min(...values)),
    maxSeconds: round(Math.max(...values)),
  };
}

function calculateSidePerformance(
  samples: readonly ClosedTradeSample[],
): SidePerformanceBreakdown[] {
  return (["long", "short"] as const).map((side) => ({
    side,
    ...calculateBreakdown(samples.filter((trade) => trade.side === side)),
  }));
}

function calculateConfidencePerformance(
  samples: readonly ClosedTradeSample[],
): ConfidencePerformanceBreakdown[] {
  return CONFIDENCE_BUCKETS.map(({ bucket, min, max }) => {
    const bucketSamples = samples.filter(
      (trade) =>
        trade.entryConfidence != null &&
        trade.entryConfidence >= min &&
        trade.entryConfidence <= max,
    );

    return {
      bucket,
      minConfidence: min,
      maxConfidence: max === 100 ? 100 : Math.floor(max),
      ...calculateBreakdown(bucketSamples),
    };
  });
}

function normalizeCloseReason(reason: string | null | undefined): string | null {
  const normalized = reason?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function calculateExitReasonPerformance(
  samples: readonly ClosedTradeSample[],
): ExitReasonPerformanceBreakdown[] {
  const reasons = Array.from(
    new Set(
      samples
        .map((trade) => normalizeCloseReason(trade.closeReason))
        .filter((reason): reason is string => reason !== null),
    ),
  ).sort();

  return reasons.map((reason) => ({
    reason,
    ...calculateBreakdown(
      samples.filter(
        (trade) => normalizeCloseReason(trade.closeReason) === reason,
      ),
    ),
  }));
}


function percentile(values: readonly number[], percentileValue: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) return round(sorted[lower]);

  const weight = index - lower;
  return round(sorted[lower] * (1 - weight) + sorted[upper] * weight);
}

const EXCURSION_BUCKETS = [
  { bucket: "0-0.25", min: 0, max: 0.25 },
  { bucket: "0.25-0.5", min: 0.25, max: 0.5 },
  { bucket: "0.5-1.0", min: 0.5, max: 1 },
  { bucket: "1.0-2.0", min: 1, max: 2 },
  { bucket: "2.0+", min: 2, max: null },
] as const;

function calculateDistribution(
  values: readonly number[],
): ExcursionDistributionBucket[] {
  return EXCURSION_BUCKETS.map(({ bucket, min, max }) => {
    const trades = values.filter(
      (value) => value >= min && (max == null || value < max),
    ).length;

    return {
      bucket,
      minPercent: min,
      maxPercent: max,
      trades,
      rate: values.length > 0 ? round((trades / values.length) * 100) : null,
    };
  });
}

function deriveExcursionProtectionThresholds(
  targetReturnPercent: number,
): { breakEvenActivationPercent: number; trailingActivationPercent: number } {
  return {
    breakEvenActivationPercent: Math.min(
      0.75,
      Math.max(0.35, targetReturnPercent * 0.2),
    ),
    trailingActivationPercent: Math.min(
      1.5,
      Math.max(0.6, targetReturnPercent * 0.35),
    ),
  };
}

function calculateExcursionMetrics(
  samples: readonly ClosedTradeSample[],
  targets: ExcursionTargets,
): ExcursionMetrics {
  if (
    !Number.isFinite(targets.takeProfitPercent) ||
    !Number.isFinite(targets.stopLossPercent) ||
    targets.takeProfitPercent <= 0 ||
    targets.stopLossPercent <= 0
  ) {
    throw new Error("MFE/MAE 분석용 TP·SL 목표 비율은 0보다 커야 합니다.");
  }

  const excursionSamples = samples.filter(
    (trade) => trade.mfePercent != null && trade.maePercent != null,
  );

  const mfeValues = excursionSamples.map((trade) => trade.mfePercent as number);
  const maeValues = excursionSamples.map((trade) => trade.maePercent as number);
  const adverseMagnitudeValues = maeValues.map((value) => Math.abs(value));
  const protection = deriveExcursionProtectionThresholds(
    targets.takeProfitPercent,
  );

  const tpReachTrades = mfeValues.filter(
    (value) => value >= targets.takeProfitPercent,
  ).length;
  const slReachTrades = adverseMagnitudeValues.filter(
    (value) => value >= targets.stopLossPercent,
  ).length;
  const breakEvenOpportunityTrades = mfeValues.filter(
    (value) => value >= protection.breakEvenActivationPercent,
  ).length;
  const trailingOpportunityTrades = mfeValues.filter(
    (value) => value >= protection.trailingActivationPercent,
  ).length;

  const average = (values: readonly number[]): number | null =>
    values.length > 0
      ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;

  return {
    samples: excursionSamples.length,
    averageMfePercent: average(mfeValues),
    medianMfePercent: percentile(mfeValues, 0.5),
    p25MfePercent: percentile(mfeValues, 0.25),
    p75MfePercent: percentile(mfeValues, 0.75),
    maxMfePercent:
      mfeValues.length > 0 ? round(Math.max(...mfeValues)) : null,
    averageMaePercent: average(maeValues),
    medianMaePercent: percentile(maeValues, 0.5),
    p25MaePercent: percentile(maeValues, 0.25),
    p75MaePercent: percentile(maeValues, 0.75),
    minMaePercent:
      maeValues.length > 0 ? round(Math.min(...maeValues)) : null,
    tpTargetPercent: round(targets.takeProfitPercent),
    slTargetPercent: round(targets.stopLossPercent),
    tpReachTrades,
    tpReachRate:
      excursionSamples.length > 0
        ? round((tpReachTrades / excursionSamples.length) * 100)
        : null,
    slReachTrades,
    slReachRate:
      excursionSamples.length > 0
        ? round((slReachTrades / excursionSamples.length) * 100)
        : null,
    breakEvenActivationPercent: round(protection.breakEvenActivationPercent),
    breakEvenOpportunityTrades,
    breakEvenOpportunityRate:
      excursionSamples.length > 0
        ? round((breakEvenOpportunityTrades / excursionSamples.length) * 100)
        : null,
    trailingActivationPercent: round(protection.trailingActivationPercent),
    trailingOpportunityTrades,
    trailingOpportunityRate:
      excursionSamples.length > 0
        ? round((trailingOpportunityTrades / excursionSamples.length) * 100)
        : null,
    mfeDistribution: calculateDistribution(mfeValues),
    maeDistribution: calculateDistribution(adverseMagnitudeValues),
  };
}

function calculateMaxDrawdown(samples: readonly ClosedTradeSample[]): {
  amount: number;
  percent: number;
} {
  let cumulativePnl = 0;
  let pnlPeak = 0;
  let maxDrawdown = 0;
  let compoundedEquity = 100;
  let equityPeak = 100;
  let maxDrawdownPercent = 0;

  for (const sample of samples) {
    cumulativePnl += sample.netPnl;
    pnlPeak = Math.max(pnlPeak, cumulativePnl);
    maxDrawdown = Math.max(maxDrawdown, pnlPeak - cumulativePnl);

    compoundedEquity *= Math.max(0, 1 + sample.returnPercent / 100);
    equityPeak = Math.max(equityPeak, compoundedEquity);

    if (equityPeak > 0) {
      maxDrawdownPercent = Math.max(
        maxDrawdownPercent,
        ((equityPeak - compoundedEquity) / equityPeak) * 100,
      );
    }
  }

  return {
    amount: round(maxDrawdown),
    percent: round(maxDrawdownPercent),
  };
}

function calculateMaxStreaks(samples: readonly ClosedTradeSample[]): {
  wins: number;
  losses: number;
} {
  let currentWins = 0;
  let currentLosses = 0;
  let maxWins = 0;
  let maxLosses = 0;

  for (const sample of samples) {
    if (sample.netPnl > 0) {
      currentWins += 1;
      currentLosses = 0;
      maxWins = Math.max(maxWins, currentWins);
    } else if (sample.netPnl < 0) {
      currentLosses += 1;
      currentWins = 0;
      maxLosses = Math.max(maxLosses, currentLosses);
    } else {
      currentWins = 0;
      currentLosses = 0;
    }
  }

  return { wins: maxWins, losses: maxLosses };
}

export function analyzeStrategyPerformance(
  samples: readonly ClosedTradeSample[],
  thresholds: SampleThresholds = DEFAULT_SAMPLE_THRESHOLDS,
  excursionTargets: ExcursionTargets = {
    takeProfitPercent: 3,
    stopLossPercent: 1.5,
  },
): StrategyPerformanceMetrics {
  validateThresholds(thresholds);
  const trades = validateAndSortSamples(samples);
  const winning = trades.filter((trade) => trade.netPnl > 0);
  const losing = trades.filter((trade) => trade.netPnl < 0);
  const breakeven = trades.length - winning.length - losing.length;
  const decisiveTrades = winning.length + losing.length;
  const grossProfit = winning.reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(
    losing.reduce((sum, trade) => sum + trade.netPnl, 0),
  );
  const netPnl = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
  const totalReturn = trades.reduce(
    (sum, trade) => sum + trade.returnPercent,
    0,
  );
  const averageWin =
    winning.length > 0 ? grossProfit / winning.length : null;
  const averageLoss =
    losing.length > 0 ? grossLoss / losing.length : null;
  const drawdown = calculateMaxDrawdown(trades);
  const streaks = calculateMaxStreaks(trades);
  const sampleStatus: SampleStatus =
    trades.length >= thresholds.readyTrades
      ? "ready"
      : trades.length >= thresholds.provisionalTrades
        ? "provisional"
        : "insufficient";

  return {
    totalTrades: trades.length,
    winningTrades: winning.length,
    losingTrades: losing.length,
    breakevenTrades: breakeven,
    winRate:
      decisiveTrades > 0 ? round((winning.length / decisiveTrades) * 100) : null,
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    netPnl: round(netPnl),
    averagePnl: trades.length > 0 ? round(netPnl / trades.length) : null,
    averageReturnPercent:
      trades.length > 0 ? round(totalReturn / trades.length) : null,
    averageWin: averageWin === null ? null : round(averageWin),
    averageLoss: averageLoss === null ? null : round(averageLoss),
    payoffRatio:
      averageWin !== null && averageLoss !== null && averageLoss > 0
        ? round(averageWin / averageLoss)
        : null,
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss) : null,
    maxDrawdown: drawdown.amount,
    maxDrawdownPercent: drawdown.percent,
    consecutiveWinsMax: streaks.wins,
    consecutiveLossesMax: streaks.losses,
    holdingTime: calculateHoldingTime(trades),
    sidePerformance: calculateSidePerformance(trades),
    confidencePerformance: calculateConfidencePerformance(trades),
    exitReasonPerformance: calculateExitReasonPerformance(trades),
    excursion: calculateExcursionMetrics(trades, excursionTargets),
    sampleStatus,
    optimizationEligible: trades.length >= thresholds.provisionalTrades,
    tradesUntilProvisional: Math.max(
      0,
      thresholds.provisionalTrades - trades.length,
    ),
    tradesUntilReady: Math.max(0, thresholds.readyTrades - trades.length),
    firstTradeAt: trades[0]?.closedAt ?? null,
    lastTradeAt: trades.at(-1)?.closedAt ?? null,
    lastTradeId: trades.at(-1)?.id ?? null,
  };
}
