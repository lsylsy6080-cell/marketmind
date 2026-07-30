import { createAdminClient } from "@/lib/supabase/admin";
import type { DashboardData, MarketIntelligenceRow } from "./types";

const SELECT_COLUMNS = [
  "id",
  "symbol",
  "calculated_at",
  "market_score",
  "raw_score",
  "consensus_adjustment",
  "confidence",
  "direction",
  "signal",
  "risk_level",
  "conflict_level",
  "consensus_strength",
  "direction_votes",
  "breakdown",
  "summary",
  "reasons",
  "component_count",
  "strategy_version",
].join(",");

export async function getMarketIntelligenceDashboardData(): Promise<DashboardData> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("market_intelligence_scores")
      .select(SELECT_COLUMNS)
      .eq("symbol", "BTCUSDT")
      .order("calculated_at", { ascending: false })
      .limit(24);

    if (error) throw error;

    const history = (data ?? []) as unknown as MarketIntelligenceRow[];
    return { latest: history[0] ?? null, history, error: null };
  } catch (error) {
    return {
      latest: null,
      history: [],
      error: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    };
  }
}
