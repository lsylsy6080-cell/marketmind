import { createAdminClient } from "../lib/supabase/admin";
import type {
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
  openPositions: [],
  orders: [],
  trades: [],
  runs: [],
  equity: [],
  decisionsById: {},
  marketPrice: null,
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

export async function getPaperTradingData(): Promise<PaperTradingData> {
  try {
    const supabase = createAdminClient();
    const [
      accountResult,
      decisionsResult,
      fundingResult,
      backtestsResult,
      performanceResult,
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
    ]);

    const globalError = [
      decisionsResult.error,
      fundingResult.error,
      backtestsResult.error,
      performanceResult.error,
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
    const globalData = {
      decisions,
      funding,
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
