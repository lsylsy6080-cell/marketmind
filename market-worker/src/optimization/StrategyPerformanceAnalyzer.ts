export type SampleStatus = "insufficient" | "provisional" | "ready";

export interface ClosedTradeSample {
  id: number;
  netPnl: number;
  returnPercent: number;
  closedAt: string;
}

export interface SampleThresholds {
  provisionalTrades: number;
  readyTrades: number;
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

    return { ...sample };
  });

  return validated.sort((left, right) => {
    const timeDifference =
      Date.parse(left.closedAt) - Date.parse(right.closedAt);
    return timeDifference !== 0 ? timeDifference : left.id - right.id;
  });
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
