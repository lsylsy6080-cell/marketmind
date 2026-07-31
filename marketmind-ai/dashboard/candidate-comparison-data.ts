import { createAdminClient } from "../lib/supabase/admin";
import type {
  CandidateComparisonData,
  CandidateComparisonRow,
} from "./types";

const numericKeys = [
  "id",
  "long_score_min",
  "short_score_max",
  "confidence_min",
  "position_size_percent",
  "source_observation_count",
  "selected_trades",
  "skipped_observations",
  "selection_rate",
  "winning_trades",
  "losing_trades",
  "win_rate",
  "expected_return_percent",
  "cumulative_return_percent",
  "profit_factor",
  "max_drawdown_percent",
] as const;

export async function getCandidateComparisonData(): Promise<CandidateComparisonData> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("latest_strategy_candidate_comparisons")
      .select("*");

    if (error) throw error;

    const order = {
      conservative: 0,
      balanced: 1,
      aggressive: 2,
    } as const;
    const rows = (data ?? [])
      .map((source) => {
        const row = { ...source } as Record<string, unknown>;
        for (const key of numericKeys) {
          row[key] =
            row[key] === null || row[key] === undefined
              ? null
              : Number(row[key]);
        }
        return row as CandidateComparisonRow;
      })
      .sort(
        (left, right) =>
          order[left.candidate_kind] - order[right.candidate_kind],
      );

    return { rows, error: null };
  } catch (error: unknown) {
    return {
      rows: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
