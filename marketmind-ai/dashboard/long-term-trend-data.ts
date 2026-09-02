import { createAdminClient } from "@/lib/supabase/admin";

export type LongTermTrendSnapshot = {
  id: number;
  engine_version: string | null;
  snapshot_hour: string;
  market_price: number | null;
  weekly_label: string | null;
  weekly_score: number | null;
  daily_label: string | null;
  daily_score: number | null;
  four_hour_label: string | null;
  four_hour_score: number | null;
  combined_label: string | null;
  combined_score: number | null;
  combined_confidence: number | null;
  combined_risk: number | null;
  trend_continuation: number | null;
  reversal_risk: number | null;
  long_term_support: number | null;
  long_term_resistance: number | null;
  current_support: number | null;
  current_support_source: string | null;
  current_support_distance_pct: number | null;
  current_resistance: number | null;
  current_resistance_source: string | null;
  current_resistance_distance_pct: number | null;
  current_range_width_pct: number | null;
  neutral_range_eligible: boolean | null;
  bullish_scenario_strength: number | null;
  bullish_scenario_state: string | null;
  neutral_scenario_strength: number | null;
  neutral_scenario_state: string | null;
  bearish_scenario_strength: number | null;
  bearish_scenario_state: string | null;
  scenario_activation_reason: Record<string, unknown> | null;
  snapshot_payload: Record<string, unknown> | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : null);

function map(row: any): LongTermTrendSnapshot {
  return {
    ...row,
    id: Number(row.id),
    market_price: num(row.market_price),
    weekly_score: num(row.weekly_score), daily_score: num(row.daily_score), four_hour_score: num(row.four_hour_score),
    combined_score: num(row.combined_score), combined_confidence: num(row.combined_confidence), combined_risk: num(row.combined_risk),
    trend_continuation: num(row.trend_continuation), reversal_risk: num(row.reversal_risk),
    long_term_support: num(row.long_term_support), long_term_resistance: num(row.long_term_resistance),
    current_support: num(row.current_support), current_support_distance_pct: num(row.current_support_distance_pct),
    current_resistance: num(row.current_resistance), current_resistance_distance_pct: num(row.current_resistance_distance_pct),
    current_range_width_pct: num(row.current_range_width_pct),
    bullish_scenario_strength: num(row.bullish_scenario_strength), neutral_scenario_strength: num(row.neutral_scenario_strength), bearish_scenario_strength: num(row.bearish_scenario_strength),
  };
}

export async function getLongTermTrendData() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("long_term_trend_snapshots")
      .select("*")
      .order("snapshot_hour", { ascending: false })
      .limit(72);
    if (error) throw error;
    const history = (data ?? []).map(map);
    return { latest: history[0] ?? null, history, error: null as string | null };
  } catch (error: unknown) {
    return { latest: null, history: [] as LongTermTrendSnapshot[], error: error instanceof Error ? error.message : String(error) };
  }
}
