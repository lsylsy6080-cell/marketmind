import { createAdminClient } from "../lib/supabase/admin";
import type {
  AiDecisionV2Snapshot,
  BacktestSummary,
  FinalMarketBacktest,
  FinalMarketDecision,
  FinalMarketPerformance,
  FundingSnapshot,
  PaperEquitySnapshot,
  PaperOrder,
  PaperPosition,
  PaperStrategyConfig,
  PaperStrategyRun,
  PaperTrade,
  PaperTradingAccount,
  PaperTradingData,
  PerformanceSummary,
  StrategyPerformanceSnapshot,
  StrategyExcursionMetrics,
  ExcursionDistributionBucket,
  StrategyPerformanceSlice,
} from "./types";

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numericRow<T>(row: Record<string, unknown>, keys: string[]): T {
  const result = { ...row };
  keys.forEach((key) => {
    result[key] = numberValue(row[key]);
  });
  return result as T;
}

function nullableNumericRow<T>(
  row: Record<string, unknown>,
  keys: string[],
): T {
  const result = { ...row };
  keys.forEach((key) => {
    result[key] = nullableNumber(row[key]);
  });
  return result as T;
}

const emptyBacktestSummary: BacktestSummary = {
  total: 0,
  completed: 0,
  inProgress: 0,
  failed: 0,
  average24hReturn: null,
  bestReturn: null,
  worstReturn: null,
};

const emptyPerformanceSummary: PerformanceSummary = {
  total: 0,
  evaluated: 0,
  directionCorrect: 0,
  directionEvaluated: 0,
  directionAccuracy: null,
  actionCorrect: 0,
  actionEvaluated: 0,
  actionAccuracy: null,
  averageDirectionalReturn: null,
  cumulativeDirectionalReturn: null,
  bestDirectionalReturn: null,
  worstDirectionalReturn: null,
};

export const emptyPaperTradingData: PaperTradingData = {
  account: null,
  config: null,
  decisions: [],
  funding: null,
  backtestSummary: emptyBacktestSummary,
  performanceSummary: emptyPerformanceSummary,
  strategyPerformance: null,
  openPositions: [],
  orders: [],
  trades: [],
  runs: [],
  equity: [],
  decisionsById: {},
  marketPrice: null,
  decisionV2: null,
  error: null,
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summarizeBacktests(rows: FinalMarketBacktest[]): BacktestSummary {
  const completedRows = rows.filter((row) => row.status === "completed");
  const returns = completedRows
    .map((row) => nullableNumber(row.return_24h))
    .filter((value): value is number => value !== null);

  return {
    total: rows.length,
    completed: completedRows.length,
    inProgress: rows.filter(
      (row) => row.status !== "completed" && row.status !== "failed",
    ).length,
    failed: rows.filter((row) => row.status === "failed").length,
    average24hReturn: average(returns),
    bestReturn: returns.length > 0 ? Math.max(...returns) : null,
    worstReturn: returns.length > 0 ? Math.min(...returns) : null,
  };
}

function summarizePerformance(
  rows: FinalMarketPerformance[],
): PerformanceSummary {
  const evaluated = rows.filter((row) => row.evaluation_status === "completed");
  const directionRows = evaluated.filter(
    (row) =>
      row.direction_result === "correct" ||
      row.direction_result === "incorrect",
  );
  const actionRows = evaluated.filter(
    (row) => row.action_result === "correct" || row.action_result === "incorrect",
  );
  const directionCorrect = directionRows.filter(
    (row) => row.direction_result === "correct",
  ).length;
  const actionCorrect = actionRows.filter(
    (row) => row.action_result === "correct",
  ).length;
  const returns = evaluated
    .map((row) => nullableNumber(row.directional_return))
    .filter((value): value is number => value !== null);

  return {
    total: rows.length,
    evaluated: evaluated.length,
    directionCorrect,
    directionEvaluated: directionRows.length,
    directionAccuracy:
      directionRows.length > 0
        ? (directionCorrect / directionRows.length) * 100
        : null,
    actionCorrect,
    actionEvaluated: actionRows.length,
    actionAccuracy:
      actionRows.length > 0 ? (actionCorrect / actionRows.length) * 100 : null,
    averageDirectionalReturn: average(returns),
    cumulativeDirectionalReturn:
      returns.length > 0
        ? returns.reduce((sum, value) => sum + value, 0)
        : null,
    bestDirectionalReturn: returns.length > 0 ? Math.max(...returns) : null,
    worstDirectionalReturn: returns.length > 0 ? Math.min(...returns) : null,
  };
}

function performanceSlice(value: unknown): StrategyPerformanceSlice[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) => ({
      ...(typeof row.side === "string" ? { side: row.side as "long" | "short" } : {}),
      ...(typeof row.bucket === "string" ? { bucket: row.bucket } : {}),
      ...(typeof row.reason === "string" ? { reason: row.reason } : {}),
      ...(nullableNumber(row.minConfidence) !== null ? { minConfidence: nullableNumber(row.minConfidence) ?? undefined } : {}),
      ...(nullableNumber(row.maxConfidence) !== null ? { maxConfidence: nullableNumber(row.maxConfidence) ?? undefined } : {}),
      totalTrades: numberValue(row.totalTrades),
      winningTrades: numberValue(row.winningTrades),
      losingTrades: numberValue(row.losingTrades),
      breakevenTrades: numberValue(row.breakevenTrades),
      winRate: nullableNumber(row.winRate),
      netPnl: numberValue(row.netPnl),
      averagePnl: nullableNumber(row.averagePnl),
      averageReturnPercent: nullableNumber(row.averageReturnPercent),
      profitFactor: nullableNumber(row.profitFactor),
    }));
}

function excursionDistribution(value: unknown): ExcursionDistributionBucket[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => ({
      bucket: typeof item.bucket === "string" ? item.bucket : "—",
      trades: numberValue(item.trades),
      rate: nullableNumber(item.rate),
      minPercent: numberValue(item.minPercent),
      maxPercent: nullableNumber(item.maxPercent),
    }));
}

function excursionMetrics(value: unknown): StrategyExcursionMetrics | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  return {
    samples: numberValue(row.samples),
    averageMfePercent: nullableNumber(row.averageMfePercent),
    medianMfePercent: nullableNumber(row.medianMfePercent),
    p25MfePercent: nullableNumber(row.p25MfePercent),
    p75MfePercent: nullableNumber(row.p75MfePercent),
    maxMfePercent: nullableNumber(row.maxMfePercent),
    averageMaePercent: nullableNumber(row.averageMaePercent),
    medianMaePercent: nullableNumber(row.medianMaePercent),
    p25MaePercent: nullableNumber(row.p25MaePercent),
    p75MaePercent: nullableNumber(row.p75MaePercent),
    minMaePercent: nullableNumber(row.minMaePercent),
    tpTargetPercent: nullableNumber(row.tpTargetPercent),
    slTargetPercent: nullableNumber(row.slTargetPercent),
    tpReachTrades: numberValue(row.tpReachTrades),
    slReachTrades: numberValue(row.slReachTrades),
    tpReachRate: nullableNumber(row.tpReachRate),
    slReachRate: nullableNumber(row.slReachRate),
    breakEvenActivationPercent: nullableNumber(row.breakEvenActivationPercent),
    trailingActivationPercent: nullableNumber(row.trailingActivationPercent),
    breakEvenOpportunityTrades: numberValue(row.breakEvenOpportunityTrades),
    trailingOpportunityTrades: numberValue(row.trailingOpportunityTrades),
    breakEvenOpportunityRate: nullableNumber(row.breakEvenOpportunityRate),
    trailingOpportunityRate: nullableNumber(row.trailingOpportunityRate),
    mfeDistribution: excursionDistribution(row.mfeDistribution),
    maeDistribution: excursionDistribution(row.maeDistribution),
  };
}

function mapStrategyPerformance(row: Record<string, unknown>): StrategyPerformanceSnapshot {
  return {
    ...nullableNumericRow<StrategyPerformanceSnapshot>(row, [
      "win_rate",
      "average_return_percent",
      "average_win",
      "average_loss",
      "profit_factor",
      "max_drawdown",
      "max_drawdown_percent",
      "average_holding_seconds",
      "min_holding_seconds",
      "max_holding_seconds",
    ]),
    id: numberValue(row.id),
    strategy_config_id: numberValue(row.strategy_config_id),
    account_id: numberValue(row.account_id),
    total_trades: numberValue(row.total_trades),
    winning_trades: numberValue(row.winning_trades),
    losing_trades: numberValue(row.losing_trades),
    breakeven_trades: numberValue(row.breakeven_trades),
    net_pnl: numberValue(row.net_pnl),
    trades_until_provisional: numberValue(row.trades_until_provisional),
    trades_until_ready: numberValue(row.trades_until_ready),
    side_performance: performanceSlice(row.side_performance),
    confidence_performance: performanceSlice(row.confidence_performance),
    exit_reason_performance: performanceSlice(row.exit_reason_performance),
    excursion_metrics: excursionMetrics(row.excursion_metrics),
    optimization_eligible: Boolean(row.optimization_eligible),
  };
}

export async function getPaperTradingData(): Promise<PaperTradingData> {
  try {
    const supabase = createAdminClient();
    const [
      accountResult,
      decisionsResult,
      fundingResult,
      backtestsResult,
      performanceResult,
      decisionV2Result,
    ] = await Promise.all([
      supabase
        .from("paper_trading_accounts")
        .select("*")
        .eq("is_active", true)
        .order("id")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("final_market_decisions")
        .select("*")
        .eq("symbol", "BTCUSDT")
        .order("decided_at", { ascending: false })
        .limit(24),
      supabase
        .from("funding_snapshots")
        .select("*")
        .eq("symbol", "BTCUSDT")
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("final_market_backtests")
        .select("*")
        .eq("symbol", "BTCUSDT")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("final_market_performance")
        .select("*")
        .eq("symbol", "BTCUSDT")
        .order("evaluated_at", { ascending: false })
        .limit(200),
      supabase
        .from("ai_decision_v2_snapshots")
        .select("id,symbol,calculated_at,direction_score,market_trend_strength,direction_strength,final_score,final_confidence,direction,action,entry_quality_score,entry_quality,overheat_risk,reversal_risk,data_reliability,risk_level,trading_permission,preferred_entry,entry_plan,entry_trigger,strategy_version")
        .eq("symbol", "BTCUSDT")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const globalError = [
      decisionsResult.error,
      fundingResult.error,
      backtestsResult.error,
      performanceResult.error,
      decisionV2Result.error,
    ].find(Boolean);
    if (globalError) throw globalError;

    const decisionNumberKeys = [
      "technical_score",
      "technical_confidence",
      "news_score",
      "news_confidence",
      "funding_score",
      "funding_confidence",
      "technical_weight",
      "news_weight",
      "funding_weight",
      "final_score",
      "final_confidence",
      "conflict_score",
    ];
    const decisions = (decisionsResult.data ?? []).map((row) =>
      nullableNumericRow<FinalMarketDecision>(row, decisionNumberKeys),
    );
    const funding = fundingResult.data
      ? nullableNumericRow<FundingSnapshot>(fundingResult.data, [
          "funding_rate",
          "funding_rate_percent",
          "annualized_rate",
          "annualized_rate_percent",
          "mark_price",
          "index_price",
        ])
      : null;
    const backtests = (backtestsResult.data ?? []) as FinalMarketBacktest[];
    const performance =
      (performanceResult.data ?? []) as FinalMarketPerformance[];
    const decisionV2 = decisionV2Result.data
      ? nullableNumericRow<AiDecisionV2Snapshot>(decisionV2Result.data, [
          "direction_score", "market_trend_strength", "direction_strength", "final_score", "final_confidence",
          "entry_quality_score", "overheat_risk", "reversal_risk", "data_reliability",
        ])
      : null;
    const globalData = {
      decisions,
      funding,
      decisionV2,
      backtestSummary: summarizeBacktests(backtests),
      performanceSummary: summarizePerformance(performance),
    };

    if (accountResult.error) throw accountResult.error;
    if (!accountResult.data) {
      return {
        ...emptyPaperTradingData,
        ...globalData,
        decisionsById: Object.fromEntries(
          decisions.map((decision) => [decision.id, decision]),
        ),
      };
    }

    const accountId = Number(accountResult.data.id);
    const [
      configResult,
      positionsResult,
      ordersResult,
      tradesResult,
      runsResult,
      equityResult,
    ] = await Promise.all([
      supabase
        .from("paper_strategy_configs")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("paper_positions")
        .select("*")
        .eq("account_id", accountId)
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(20),
      supabase
        .from("paper_orders")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("paper_trades")
        .select("*")
        .eq("account_id", accountId)
        .order("closed_at", { ascending: false })
        .limit(100),
      supabase
        .from("paper_strategy_runs")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("paper_equity_snapshots")
        .select("*")
        .eq("account_id", accountId)
        .order("captured_at", { ascending: true })
        .limit(180),
    ]);

    const firstError = [
      configResult.error,
      positionsResult.error,
      ordersResult.error,
      tradesResult.error,
      runsResult.error,
      equityResult.error,
    ].find(Boolean);
    if (firstError) throw firstError;

    let strategyPerformance: StrategyPerformanceSnapshot | null = null;
    const activeConfigId = configResult.data?.id ? Number(configResult.data.id) : null;

    if (activeConfigId !== null) {
      const activePerformanceResult = await supabase
        .from("strategy_performance_snapshots")
        .select("*")
        .eq("strategy_config_id", activeConfigId)
        .order("analyzed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activePerformanceResult.error) throw activePerformanceResult.error;
      if (activePerformanceResult.data) {
        const mapped = mapStrategyPerformance(activePerformanceResult.data);
        const hasV2Data =
          mapped.average_holding_seconds !== null ||
          mapped.side_performance.length > 0 ||
          mapped.confidence_performance.length > 0 ||
          mapped.exit_reason_performance.length > 0;
        if (hasV2Data) strategyPerformance = mapped;
      }
    }

    // 활성 전략에 아직 V2 스냅샷이 없더라도 패널이 사라지지 않도록
    // 전체 전략 중 가장 최근에 생성된 V2 스냅샷을 fallback으로 사용합니다.
    if (!strategyPerformance) {
      const latestPerformanceResult = await supabase
        .from("strategy_performance_snapshots")
        .select("*")
        .order("analyzed_at", { ascending: false })
        .limit(20);

      if (latestPerformanceResult.error) throw latestPerformanceResult.error;
      const latestV2Row = (latestPerformanceResult.data ?? []).find((row) => {
        const mapped = mapStrategyPerformance(row);
        return (
          mapped.average_holding_seconds !== null ||
          mapped.side_performance.length > 0 ||
          mapped.confidence_performance.length > 0 ||
          mapped.exit_reason_performance.length > 0
        );
      });
      if (latestV2Row) strategyPerformance = mapStrategyPerformance(latestV2Row);
    }

    const decisionIds = new Set<number>();
    for (const position of positionsResult.data ?? []) {
      if (position.opening_decision_id) {
        decisionIds.add(Number(position.opening_decision_id));
      }
    }
    for (const run of runsResult.data ?? []) {
      if (run.decision_id) decisionIds.add(Number(run.decision_id));
    }

    const decisionsById: Record<number, FinalMarketDecision> =
      Object.fromEntries(decisions.map((decision) => [decision.id, decision]));
    const missingDecisionIds = [...decisionIds].filter(
      (id) => !decisionsById[id],
    );

    if (missingDecisionIds.length > 0) {
      const referencedResult = await supabase
        .from("final_market_decisions")
        .select("*")
        .in("id", missingDecisionIds);

      if (!referencedResult.error) {
        for (const row of referencedResult.data ?? []) {
          const decision = nullableNumericRow<FinalMarketDecision>(
            row,
            decisionNumberKeys,
          );
          decisionsById[decision.id] = decision;
        }
      }
    }

    const account = numericRow<PaperTradingAccount>(accountResult.data, [
      "id",
      "initial_balance",
      "cash_balance",
      "realized_pnl",
      "total_fees",
    ]);
    const config = configResult.data
      ? numericRow<PaperStrategyConfig>(configResult.data, [
          "id",
          "account_id",
          "long_score_min",
          "short_score_max",
          "confidence_min",
          "position_size_percent",
          "stop_loss_percent",
          "take_profit_percent",
          "max_holding_minutes",
          "fee_rate_percent",
          "slippage_percent",
        ])
      : null;
    const openPositions = (positionsResult.data ?? []).map((row) =>
      numericRow<PaperPosition>(row, [
        "id",
        "account_id",
        "opening_decision_id",
        "quantity",
        "entry_price",
        "exit_price",
        "stop_loss_price",
        "take_profit_price",
        "entry_fee",
        "exit_fee",
        "realized_pnl",
        "realized_return_percent",
      ]),
    );
    const orders = (ordersResult.data ?? []).map((row) =>
      numericRow<PaperOrder>(row, [
        "id",
        "account_id",
        "decision_id",
        "requested_price",
        "executed_price",
        "quantity",
        "notional",
        "fee",
      ]),
    );
    const trades = (tradesResult.data ?? []).map((row) =>
      numericRow<PaperTrade>(row, [
        "id",
        "account_id",
        "position_id",
        "entry_price",
        "exit_price",
        "quantity",
        "gross_pnl",
        "fees",
        "net_pnl",
        "return_percent",
      ]),
    );
    const runs = (runsResult.data ?? []).map((row) =>
      numericRow<PaperStrategyRun>(row, [
        "id",
        "account_id",
        "decision_id",
        "market_price",
      ]),
    );
    const equity = (equityResult.data ?? []).map((row) =>
      numericRow<PaperEquitySnapshot>(row, [
        "id",
        "account_id",
        "cash_balance",
        "unrealized_pnl",
        "equity",
        "market_price",
      ]),
    );
    const marketPrice =
      runs.find((run) => run.market_price)?.market_price ??
      equity.at(-1)?.market_price ??
      funding?.mark_price ??
      openPositions[0]?.entry_price ??
      null;

    return {
      account,
      config,
      ...globalData,
      strategyPerformance,
      openPositions,
      orders,
      trades,
      runs,
      equity,
      decisionsById,
      marketPrice,
      error: null,
    };
  } catch (error: unknown) {
    return {
      ...emptyPaperTradingData,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
