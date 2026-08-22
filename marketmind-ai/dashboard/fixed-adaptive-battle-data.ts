import { createClient } from "@supabase/supabase-js";

export type BattleMetrics = {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number | null;
  netPnl: number;
  netReturnPercent: number;
  averagePnl: number | null;
  expectancyPercent: number | null;
  profitFactor: number | null;
  maxDrawdownPercent: number;
  totalFees: number;
  feeToGrossProfitPercent: number | null;
  averageHoldingMinutes: number | null;
  averageLeverage: number | null;
  leverageAdjustmentRate: number | null;
};

export type BattleScore = {
  total: number;
  returnScore: number;
  drawdownScore: number;
  profitFactorScore: number;
  expectancyScore: number;
  consistencyScore: number;
};

export type FixedAdaptiveBattleData = {
  status: "warming_up" | "comparable" | "unavailable";
  winner: "fixed" | "adaptive" | "tie" | "inconclusive";
  minimumTradesRequired: number;
  fixed: BattleMetrics | null;
  adaptive: BattleMetrics | null;
  fixedScore: BattleScore | null;
  adaptiveScore: BattleScore | null;
  reasons: string[];
  analyzedAt: string | null;
  error: string | null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const asMetrics = (value: unknown): BattleMetrics | null => {
  if (!value || typeof value !== "object") return null;
  return value as BattleMetrics;
};

const asScore = (value: unknown): BattleScore | null => {
  if (!value || typeof value !== "object") return null;
  return value as BattleScore;
};

export async function getFixedAdaptiveBattleData(): Promise<FixedAdaptiveBattleData> {
  const empty: FixedAdaptiveBattleData = {
    status: "unavailable",
    winner: "inconclusive",
    minimumTradesRequired: 30,
    fixed: null,
    adaptive: null,
    fixedScore: null,
    adaptiveScore: null,
    reasons: [],
    analyzedAt: null,
    error: null,
  };

  try {
    const supabase = getSupabase();

    const [{ data: snapshot, error: snapshotError }, { data: config, error: configError }] =
      await Promise.all([
        supabase
          .from("adaptive_battle_snapshots")
          .select("status,winner,fixed_metrics,adaptive_metrics,fixed_score,adaptive_score,reasons,analyzed_at")
          .eq("symbol", "BTCUSDT")
          .order("analyzed_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("adaptive_battle_configs")
          .select("minimum_trades")
          .eq("symbol", "BTCUSDT")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
      ]);

    if (snapshotError) {
      throw new Error(snapshotError.message);
    }
    if (configError) {
      throw new Error(configError.message);
    }

    if (!snapshot) {
      return {
        ...empty,
        minimumTradesRequired: Number(config?.minimum_trades ?? 30),
      };
    }

    const reasons = Array.isArray(snapshot.reasons)
      ? snapshot.reasons.map(String)
      : [];

    return {
      status:
        snapshot.status === "warming_up" || snapshot.status === "comparable"
          ? snapshot.status
          : "unavailable",
      winner:
        snapshot.winner === "fixed" ||
        snapshot.winner === "adaptive" ||
        snapshot.winner === "tie" ||
        snapshot.winner === "inconclusive"
          ? snapshot.winner
          : "inconclusive",
      minimumTradesRequired: Number(config?.minimum_trades ?? 30),
      fixed: asMetrics(snapshot.fixed_metrics),
      adaptive: asMetrics(snapshot.adaptive_metrics),
      fixedScore: asScore(snapshot.fixed_score),
      adaptiveScore: asScore(snapshot.adaptive_score),
      reasons,
      analyzedAt: snapshot.analyzed_at ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
