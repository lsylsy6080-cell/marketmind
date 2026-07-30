import { createAdminClient } from "../lib/supabase/admin";
import type { StrategyComparisonData, StrategyComparisonRow } from "./types";

const numericKeys = [
  "config_id", "account_id", "sort_order", "long_score_min", "short_score_max",
  "confidence_min", "stop_loss_percent", "take_profit_percent", "max_holding_minutes",
  "initial_balance", "cash_balance", "realized_pnl", "total_fees", "equity",
  "total_return_percent", "total_trades", "winning_trades", "losing_trades", "win_rate",
  "net_pnl", "avg_return_percent", "avg_win_percent", "avg_loss_percent",
  "avg_holding_minutes", "open_positions",
] as const;

export async function getStrategyComparisonData(): Promise<StrategyComparisonData> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("paper_strategy_comparison_v1")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;

    const rows = (data ?? []).map((source) => {
      const row = { ...source } as Record<string, unknown>;
      for (const key of numericKeys) row[key] = Number(row[key] ?? 0);
      row.profit_factor = row.profit_factor == null ? null : Number(row.profit_factor);
      return row as StrategyComparisonRow;
    });

    return { rows, error: null };
  } catch (error: unknown) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}
