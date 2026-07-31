import { randomUUID } from "node:crypto";
import { supabase } from "../lib/supabase";
import type { HistoricalDecisionObservation } from "./StrategyCandidateComparator";
import { validateStrategyCandidatesWalkForward } from "./StrategyWalkForwardValidator";

interface LatestValidationRow {
  validation_run_id: string;
  source_observation_count: number;
  source_last_backtest_id: number | null;
}

export async function runStrategyWalkForwardValidation(
  observations: readonly HistoricalDecisionObservation[],
): Promise<{
  validationRunId: string | null;
  results: ReturnType<typeof validateStrategyCandidatesWalkForward>;
}> {
  console.log("[Walk-Forward] Phase 5-3 시간 분리 검증 시작");

  if (observations.length === 0) {
    console.log("[Walk-Forward] 검증 가능한 완료 Backtest가 없습니다.");
    return { validationRunId: null, results: [] };
  }

  const lastBacktestId = observations.at(-1)?.id ?? null;
  const { data: latest, error: latestError } = await supabase
    .from("strategy_validation_results")
    .select("validation_run_id, source_observation_count, source_last_backtest_id")
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`기존 워크포워드 결과 조회 실패: ${latestError.message}`);
  }

  const previous = (latest as LatestValidationRow | null) ?? null;
  if (
    previous &&
    Number(previous.source_observation_count) === observations.length &&
    Number(previous.source_last_backtest_id ?? 0) === Number(lastBacktestId ?? 0)
  ) {
    console.log("[Walk-Forward] 신규 완료 Backtest가 없어 검증을 건너뜁니다.");
    return {
      validationRunId: previous.validation_run_id,
      results: validateStrategyCandidatesWalkForward(observations),
    };
  }

  const validationRunId = randomUUID();
  const results = validateStrategyCandidatesWalkForward(observations);
  const analyzedAt = new Date().toISOString();
  const rows = results.map((result) => ({
    validation_run_id: validationRunId,
    candidate_key: result.candidate.key,
    candidate_name: result.candidate.name,
    candidate_kind: result.candidate.kind,
    symbol: "BTCUSDT",
    training_ratio: 0.7,
    source_observation_count: observations.length,
    source_last_backtest_id: lastBacktestId,
    split_at: result.splitAt,
    training_observations: result.trainingObservationCount,
    validation_observations: result.validationObservationCount,
    training_trades: result.training.selectedTrades,
    validation_trades: result.validation.selectedTrades,
    training_expected_return: result.training.expectedReturnPercent,
    validation_expected_return: result.validation.expectedReturnPercent,
    training_profit_factor: result.training.profitFactor,
    validation_profit_factor: result.validation.profitFactor,
    training_max_drawdown: result.training.maxDrawdownPercent,
    validation_max_drawdown: result.validation.maxDrawdownPercent,
    return_retention_ratio: result.returnRetentionRatio,
    profit_factor_retention_ratio: result.profitFactorRetentionRatio,
    robustness_status: result.robustnessStatus,
    validation_eligible: result.validationEligible,
    validation_reason: result.reason,
    analyzed_at: analyzedAt,
  }));

  const { error } = await supabase
    .from("strategy_validation_results")
    .insert(rows);

  if (error) {
    throw new Error(`워크포워드 결과 저장 실패: ${error.message}`);
  }

  for (const result of results) {
    console.log(
      `[Walk-Forward] ${result.candidate.name} ` +
        `train=${result.training.selectedTrades} validation=${result.validation.selectedTrades} ` +
        `status=${result.robustnessStatus}`,
    );
  }

  console.log("[Walk-Forward] Phase 5-3 시간 분리 검증 완료", {
    validationRunId,
    observations: observations.length,
    candidates: results.length,
  });
  return { validationRunId, results };
}
