import { createAdminClient } from "../lib/supabase/admin";
import type {
  StrategyRecommendationData,
  StrategyRecommendationRow,
} from "./types";

export async function getStrategyRecommendationData(): Promise<StrategyRecommendationData> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("latest_strategy_recommendation")
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { recommendation: null, error: null };

    const numericKeys = [
      "id",
      "recommendation_score",
      "recommendation_confidence",
      "eligible_candidate_count",
      "selected_long_score_min",
      "selected_short_score_max",
      "selected_confidence_min",
      "selected_position_size_percent",
    ] as const;
    const row = { ...data } as Record<string, unknown>;
    for (const key of numericKeys) {
      row[key] =
        row[key] === null || row[key] === undefined
          ? null
          : Number(row[key]);
    }

    return {
      recommendation: row as StrategyRecommendationRow,
      error: null,
    };
  } catch (error: unknown) {
    return {
      recommendation: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
