import { createAdminClient } from "../lib/supabase/admin";
import type { StrategyValidationData, StrategyValidationRow } from "./types";

const numericKeys = [
  "id",
  "training_ratio",
  "source_observation_count",
  "training_observations",
  "validation_observations",
  "training_trades",
  "validation_trades",
  "training_expected_return",
  "validation_expected_return",
  "training_profit_factor",
  "validation_profit_factor",
  "training_max_drawdown",
  "validation_max_drawdown",
  "return_retention_ratio",
  "profit_factor_retention_ratio",
] as const;

export async function getStrategyValidationData(): Promise<StrategyValidationData> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("latest_strategy_validation_results")
      .select("*");

    if (error) throw error;

    const order = { conservative: 0, balanced: 1, aggressive: 2 } as const;
    const rows = (data ?? [])
      .map((source) => {
        const row = { ...source } as Record<string, unknown>;
        for (const key of numericKeys) {
          row[key] =
            row[key] === null || row[key] === undefined
              ? null
              : Number(row[key]);
        }
        return row as StrategyValidationRow;
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
