import { supabase } from "../lib/supabase";
import {
  evaluateOptimizationReadiness,
  type OptimizationReadinessInput,
} from "./OptimizationReadinessEvaluator";

function countBy<T extends Record<string, unknown>>(
  rows: T[],
  key: keyof T,
  value: unknown,
): number {
  return rows.filter((row) => row[key] === value).length;
}

export async function runOptimizationReadiness(): Promise<void> {
  console.log("[Optimization Status] Phase 5-5 통합 상태 점검 시작");

  const [performanceResult, candidatesResult, validationResult, recommendationResult] =
    await Promise.all([
      supabase.from("latest_strategy_performance").select("total_trades, sample_status"),
      supabase.from("latest_strategy_candidate_comparisons").select("selected_trades, optimization_eligible"),
      supabase.from("latest_strategy_validation_results").select("robustness_status"),
      supabase.from("latest_strategy_recommendation").select(
        "id, recommendation_status, selected_candidate_name, requires_manual_approval",
      ).maybeSingle(),
    ]);

  const firstError = [
    performanceResult.error,
    candidatesResult.error,
    validationResult.error,
    recommendationResult.error,
  ].find(Boolean);
  if (firstError) {
    throw new Error(`Phase 5 통합 상태 조회 실패: ${firstError.message}`);
  }

  const performance = (performanceResult.data ?? []) as Array<{
    total_trades: number;
    sample_status: string;
  }>;
  const candidates = (candidatesResult.data ?? []) as Array<{
    selected_trades: number;
    optimization_eligible: boolean;
  }>;
  const validation = (validationResult.data ?? []) as Array<{
    robustness_status: string;
  }>;
  const recommendation = recommendationResult.data as {
    id: number;
    recommendation_status: "recommended" | "hold";
    selected_candidate_name: string | null;
    requires_manual_approval: boolean;
  } | null;

  const input: OptimizationReadinessInput = {
    performance: {
      strategyCount: performance.length,
      readyCount: countBy(performance, "sample_status", "ready"),
      provisionalCount: countBy(performance, "sample_status", "provisional"),
      maxTrades: Math.max(0, ...performance.map((row) => Number(row.total_trades))),
    },
    candidates: {
      candidateCount: candidates.length,
      eligibleCount: candidates.filter((row) => row.optimization_eligible).length,
      maxSelectedTrades: Math.max(
        0,
        ...candidates.map((row) => Number(row.selected_trades)),
      ),
    },
    validation: {
      candidateCount: validation.length,
      robustCount: countBy(validation, "robustness_status", "robust"),
      watchCount: countBy(validation, "robustness_status", "watch"),
      overfitCount: countBy(validation, "robustness_status", "overfit"),
      insufficientCount: countBy(validation, "robustness_status", "insufficient"),
    },
    recommendation: {
      id: recommendation?.id ?? null,
      status: recommendation?.recommendation_status ?? null,
      selectedCandidateName: recommendation?.selected_candidate_name ?? null,
      requiresManualApproval:
        recommendation?.requires_manual_approval ?? true,
    },
  };
  const status = evaluateOptimizationReadiness(input);

  const { data: latest, error: latestError } = await supabase
    .from("strategy_optimization_status")
    .select("overall_status, progress_percent, recommendation_id")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    throw new Error(`기존 통합 상태 조회 실패: ${latestError.message}`);
  }

  if (
    latest &&
    latest.overall_status === status.overallStatus &&
    Number(latest.progress_percent) === status.progressPercent &&
    Number(latest.recommendation_id ?? 0) === Number(recommendation?.id ?? 0)
  ) {
    console.log("[Optimization Status] 상태 변화가 없어 저장을 건너뜁니다.");
    return;
  }

  const { error } = await supabase.from("strategy_optimization_status").insert({
    overall_status: status.overallStatus,
    progress_percent: status.progressPercent,
    safe_for_automatic_application: false,
    summary: status.summary,
    checks: status.checks,
    strategy_count: input.performance.strategyCount,
    max_trade_count: input.performance.maxTrades,
    eligible_candidate_count: input.candidates.eligibleCount,
    validated_candidate_count:
      input.validation.robustCount + input.validation.watchCount,
    recommendation_id: recommendation?.id ?? null,
  });
  if (error) {
    throw new Error(`Phase 5 통합 상태 저장 실패: ${error.message}`);
  }

  console.log("[Optimization Status] Phase 5-5 통합 상태 점검 완료", {
    overallStatus: status.overallStatus,
    progressPercent: status.progressPercent,
    automaticApplication: false,
  });
}
