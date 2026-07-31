import { createAdminClient } from "../lib/supabase/admin";
import type {
  OptimizationStatusData,
  OptimizationStatusRow,
} from "./types";

export async function getOptimizationStatusData(): Promise<OptimizationStatusData> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("latest_strategy_optimization_status")
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (!data) return { status: null, error: null };

    return {
      status: {
        ...data,
        id: Number(data.id),
        progress_percent: Number(data.progress_percent),
        strategy_count: Number(data.strategy_count),
        max_trade_count: Number(data.max_trade_count),
        eligible_candidate_count: Number(data.eligible_candidate_count),
        validated_candidate_count: Number(data.validated_candidate_count),
        recommendation_id:
          data.recommendation_id === null
            ? null
            : Number(data.recommendation_id),
      } as OptimizationStatusRow,
      error: null,
    };
  } catch (error: unknown) {
    return {
      status: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
