import { supabase } from "../lib/supabase";
import { recommendStrategy } from "./StrategyRecommendationEngine";
import type { WalkForwardValidationResult } from "./StrategyWalkForwardValidator";

export async function runStrategyRecommendation(params: {
  validationRunId: string | null;
  results: readonly WalkForwardValidationResult[];
}): Promise<void> {
  console.log("[Strategy Recommendation] Phase 5-4 추천 평가 시작");

  if (!params.validationRunId || params.results.length === 0) {
    console.log("[Strategy Recommendation] 추천 가능한 검증 결과가 없습니다.");
    return;
  }

  const { data: existing, error: existingError } = await supabase
    .from("strategy_recommendations")
    .select("id")
    .eq("source_validation_run_id", params.validationRunId)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`기존 추천 결과 조회 실패: ${existingError.message}`);
  }
  if (existing) {
    console.log("[Strategy Recommendation] 동일 검증 결과의 추천이 이미 있습니다.");
    return;
  }

  const recommendation = recommendStrategy(params.results);
  const selected = params.results.find(
    (result) =>
      result.candidate.key === recommendation.selectedCandidateKey,
  );
  const { error } = await supabase.from("strategy_recommendations").insert({
    source_validation_run_id: params.validationRunId,
    recommendation_status: recommendation.status,
    selected_candidate_key: recommendation.selectedCandidateKey,
    selected_candidate_name: recommendation.selectedCandidateName,
    selected_candidate_kind: recommendation.selectedCandidateKind,
    recommendation_score: recommendation.recommendationScore,
    recommendation_confidence: recommendation.confidence,
    recommendation_reason: recommendation.reason,
    eligible_candidate_count: recommendation.eligibleCandidateCount,
    selected_long_score_min: selected?.candidate.longScoreMin ?? null,
    selected_short_score_max: selected?.candidate.shortScoreMax ?? null,
    selected_confidence_min: selected?.candidate.confidenceMin ?? null,
    selected_position_size_percent:
      selected?.candidate.positionSizePercent ?? null,
    candidate_rankings: recommendation.rankings,
    requires_manual_approval: true,
    applied_at: null,
  });

  if (error) {
    throw new Error(`전략 추천 저장 실패: ${error.message}`);
  }

  console.log("[Strategy Recommendation] Phase 5-4 추천 평가 완료", {
    status: recommendation.status,
    selected: recommendation.selectedCandidateName,
    score: recommendation.recommendationScore,
    confidence: recommendation.confidence,
    manualApproval: true,
  });
}
