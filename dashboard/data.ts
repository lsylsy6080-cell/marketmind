import { createSupabaseServerClient } from "../lib/supabase/server";
import { emptyPaperTradingData, getPaperTradingData } from "./paper-data";
import type {
  DashboardData,
  FinalMarketBacktest,
  FinalMarketDecision,
  FinalMarketPerformance,
  FundingSnapshot,
  PerformanceSummary,
} from "./types";

const SUCCESS_RESULTS = new Set([
  "correct",
  "success",
  "win",
  "hit",
  "passed",
  "true",
]);

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDecision(row: Record<string, unknown>): FinalMarketDecision {
  return {
    ...(row as unknown as FinalMarketDecision),
    technical_score: toNumber(row.technical_score),
    technical_confidence: toNumber(row.technical_confidence),
    news_score: toNumber(row.news_score),
    news_confidence: toNumber(row.news_confidence),
    funding_score: toNumber(row.funding_score),
    funding_confidence: toNumber(row.funding_confidence),
    technical_weight: toNumber(row.technical_weight),
    news_weight: toNumber(row.news_weight),
    funding_weight: toNumber(row.funding_weight),
    final_score: toNumber(row.final_score),
    final_confidence: toNumber(row.final_confidence),
    conflict_score: toNumber(row.conflict_score),
  };
}

function normalizeFunding(row: Record<string, unknown>): FundingSnapshot {
  return {
    ...(row as unknown as FundingSnapshot),
    funding_rate: toNumber(row.funding_rate),
    funding_rate_percent: toNumber(row.funding_rate_percent),
    annualized_rate: toNumber(row.annualized_rate),
    annualized_rate_percent: toNumber(row.annualized_rate_percent),
    mark_price: toNumber(row.mark_price),
    index_price: toNumber(row.index_price),
  };
}

function normalizeBacktest(row: Record<string, unknown>): FinalMarketBacktest {
  return {
    ...(row as unknown as FinalMarketBacktest),
    return_5m: toNumber(row.return_5m),
    return_15m: toNumber(row.return_15m),
    return_30m: toNumber(row.return_30m),
    return_1h: toNumber(row.return_1h),
    return_4h: toNumber(row.return_4h),
    return_24h: toNumber(row.return_24h),
    best_return: toNumber(row.best_return),
    worst_return: toNumber(row.worst_return),
  };
}

function normalizePerformance(
  row: Record<string, unknown>,
): FinalMarketPerformance {
  return {
    ...(row as unknown as FinalMarketPerformance),
    market_return: toNumber(row.market_return),
    directional_return: toNumber(row.directional_return),
  };
}

function buildPerformanceSummary(
  rows: FinalMarketPerformance[],
): PerformanceSummary {
  const evaluatedRows = rows.filter(
    (row) => (row.evaluation_status ?? "").toLowerCase() !== "pending",
  );
  const directionRows = evaluatedRows.filter((row) => row.direction_result);
  const actionRows = evaluatedRows.filter((row) => row.action_result);

  const directionCorrect = directionRows.filter((row) =>
    SUCCESS_RESULTS.has((row.direction_result ?? "").toLowerCase()),
  ).length;
  const actionCorrect = actionRows.filter((row) =>
    SUCCESS_RESULTS.has((row.action_result ?? "").toLowerCase()),
  ).length;

  const returns = evaluatedRows
    .map((row) => row.directional_return)
    .filter((value): value is number => value !== null);

  return {
    total: rows.length,
    evaluated: evaluatedRows.length,
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
    averageDirectionalReturn:
      returns.length > 0
        ? returns.reduce((sum, value) => sum + value, 0) / returns.length
        : null,
    cumulativeDirectionalReturn:
      returns.length > 0
        ? returns.reduce((sum, value) => sum + value, 0)
        : null,
    bestDirectionalReturn: returns.length > 0 ? Math.max(...returns) : null,
    worstDirectionalReturn: returns.length > 0 ? Math.min(...returns) : null,
  };
}

const emptyData: DashboardData = {
  latestDecision: null,
  latestFunding: null,
  recentDecisions: [],
  chartDecisions: [],
  timelineDecisions: [],
  recentBacktests: [],
  paperTrading: emptyPaperTradingData,
  performanceSummary: {
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
  },
  error: null,
};

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const supabase = await createSupabaseServerClient();

    const [decisionResult, fundingResult, backtestResult, performanceResult, paperTrading] =
      await Promise.all([
        supabase
          .from("final_market_decisions")
          .select("*")
          .order("decided_at", { ascending: false })
          .limit(48),
        supabase
          .from("funding_snapshots")
          .select(
            "id,symbol,funding_rate,funding_rate_percent,annualized_rate,annualized_rate_percent,mark_price,index_price,direction,risk_level,fetched_at,analyzed_at",
          )
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("final_market_backtests")
          .select(
            "id,decision_id,symbol,status,return_5m,return_15m,return_30m,return_1h,return_4h,return_24h,best_return,worst_return,created_at,updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("final_market_performance")
          .select(
            "id,decision_id,symbol,direction_result,action_result,evaluation_status,market_return,directional_return,evaluated_at",
          )
          .order("evaluated_at", { ascending: false })
          .limit(300),
        getPaperTradingData(),
      ]);

    const queryError =
      decisionResult.error ??
      fundingResult.error ??
      backtestResult.error ??
      performanceResult.error;

    if (queryError) {
      return { ...emptyData, error: queryError.message };
    }

    const decisionsNewestFirst = (decisionResult.data ?? []).map((row) =>
      normalizeDecision(row as Record<string, unknown>),
    );
    const decisionsOldestFirst = [...decisionsNewestFirst].reverse();

    const backtests = (backtestResult.data ?? []).map((row) =>
      normalizeBacktest(row as Record<string, unknown>),
    );
    const performances = (performanceResult.data ?? []).map((row) =>
      normalizePerformance(row as Record<string, unknown>),
    );

    return {
      latestDecision: decisionsNewestFirst[0] ?? null,
      latestFunding: fundingResult.data
        ? normalizeFunding(fundingResult.data as Record<string, unknown>)
        : null,
      recentDecisions: decisionsNewestFirst.slice(0, 12),
      chartDecisions: decisionsOldestFirst,
      timelineDecisions: decisionsNewestFirst.slice(0, 8),
      recentBacktests: backtests,
      performanceSummary: buildPerformanceSummary(performances),
      paperTrading,
      error: null,
    };
  } catch (error: unknown) {
    return {
      ...emptyData,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
