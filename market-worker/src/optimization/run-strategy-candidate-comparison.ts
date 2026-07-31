import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase";
import {
  compareStrategyCandidates,
  type HistoricalDecisionObservation,
} from "./StrategyCandidateComparator";

const MAX_BACKTESTS = 2_000;

interface BacktestRow {
  id: number;
  decision_id: number;
  return_24h: number | string;
}

interface DecisionRow {
  id: number;
  decided_at: string;
  final_score: number | string;
  final_confidence: number | string;
  direction: HistoricalDecisionObservation["direction"];
  action: HistoricalDecisionObservation["action"];
  trading_permission: HistoricalDecisionObservation["tradingPermission"];
}

interface LatestComparisonRow {
  source_observation_count: number;
  source_last_backtest_id: number | null;
}

function toFiniteNumber(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

async function getCompletedBacktests(): Promise<BacktestRow[]> {
  const { data, error } = await supabase
    .from("final_market_backtests")
    .select("id, decision_id, return_24h")
    .eq("symbol", "BTCUSDT")
    .eq("status", "completed")
    .not("return_24h", "is", null)
    .order("entry_time", { ascending: true })
    .limit(MAX_BACKTESTS);

  if (error) {
    throw new Error(`후보 비교 Backtest 조회 실패: ${error.message}`);
  }
  return (data ?? []) as BacktestRow[];
}

async function getDecisions(decisionIds: number[]): Promise<Map<number, DecisionRow>> {
  if (decisionIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("final_market_decisions")
    .select(`
      id,
      decided_at,
      final_score,
      final_confidence,
      direction,
      action,
      trading_permission
    `)
    .in("id", decisionIds);

  if (error) {
    throw new Error(`후보 비교 Final Decision 조회 실패: ${error.message}`);
  }

  return new Map(
    ((data ?? []) as DecisionRow[]).map((decision) => [Number(decision.id), decision]),
  );
}

async function getLatestComparison(): Promise<LatestComparisonRow | null> {
  const { data, error } = await supabase
    .from("strategy_candidate_comparisons")
    .select("source_observation_count, source_last_backtest_id")
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`기존 후보 비교 조회 실패: ${error.message}`);
  }
  return (data as LatestComparisonRow | null) ?? null;
}

export async function runStrategyCandidateComparison(): Promise<
  HistoricalDecisionObservation[]
> {
  console.log("[Strategy Candidates] Phase 5-2 후보 비교 시작");
  const backtests = await getCompletedBacktests();

  if (backtests.length === 0) {
    console.log("[Strategy Candidates] 완료된 24시간 Backtest가 없습니다.");
    return [];
  }

  const decisions = await getDecisions(
    backtests.map((backtest) => Number(backtest.decision_id)),
  );
  const observations: HistoricalDecisionObservation[] = [];

  for (const backtest of backtests) {
    const decision = decisions.get(Number(backtest.decision_id));
    if (!decision) continue;

    observations.push({
      id: Number(backtest.id),
      decidedAt: decision.decided_at,
      finalScore: toFiniteNumber(decision.final_score, "final_score"),
      finalConfidence: toFiniteNumber(
        decision.final_confidence,
        "final_confidence",
      ),
      direction: decision.direction,
      action: decision.action,
      tradingPermission: decision.trading_permission,
      marketReturnPercent: toFiniteNumber(backtest.return_24h, "return_24h"),
    });
  }

  const lastBacktestId = observations.at(-1)?.id ?? null;
  const latest = await getLatestComparison();
  if (
    latest &&
    Number(latest.source_observation_count) === observations.length &&
    Number(latest.source_last_backtest_id ?? 0) === Number(lastBacktestId ?? 0)
  ) {
    console.log("[Strategy Candidates] 신규 완료 Backtest가 없어 비교를 건너뜁니다.");
    return observations;
  }

  const comparisonRunId = randomUUID();
  const results = compareStrategyCandidates(observations);
  const analyzedAt = new Date().toISOString();
  const rows = results.map((result) => ({
    comparison_run_id: comparisonRunId,
    candidate_key: result.candidate.key,
    candidate_name: result.candidate.name,
    candidate_kind: result.candidate.kind,
    symbol: "BTCUSDT",
    long_score_min: result.candidate.longScoreMin,
    short_score_max: result.candidate.shortScoreMax,
    confidence_min: result.candidate.confidenceMin,
    position_size_percent: result.candidate.positionSizePercent,
    fee_rate_percent: result.candidate.feeRatePercent,
    slippage_percent: result.candidate.slippagePercent,
    source_observation_count: result.observationCount,
    source_last_backtest_id: lastBacktestId,
    selected_trades: result.selectedTrades,
    skipped_observations: result.skippedObservations,
    selection_rate: result.selectionRate,
    winning_trades: result.winningTrades,
    losing_trades: result.losingTrades,
    win_rate: result.winRate,
    expected_return_percent: result.expectedReturnPercent,
    cumulative_return_percent: result.cumulativeReturnPercent,
    profit_factor: result.profitFactor,
    max_drawdown_percent: result.maxDrawdownPercent,
    sample_status: result.sampleStatus,
    optimization_eligible: result.optimizationEligible,
    analyzed_at: analyzedAt,
  }));

  const { error } = await supabase
    .from("strategy_candidate_comparisons")
    .insert(rows);

  if (error) {
    throw new Error(`전략 후보 비교 저장 실패: ${error.message}`);
  }

  for (const result of results) {
    console.log(
      `[Strategy Candidates] ${result.candidate.name} ` +
        `trades=${result.selectedTrades} status=${result.sampleStatus} ` +
        `expected=${result.expectedReturnPercent ?? "N/A"}% ` +
        `profitFactor=${result.profitFactor ?? "N/A"}`,
    );
  }

  console.log("[Strategy Candidates] Phase 5-2 후보 비교 완료", {
    comparisonRunId,
    observations: observations.length,
    candidates: results.length,
  });
  return observations;
}
