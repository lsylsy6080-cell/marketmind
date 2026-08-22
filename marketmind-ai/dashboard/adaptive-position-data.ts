import { createClient } from "@supabase/supabase-js";

export type AdaptivePositionPlanData = {
  status: "open" | "ready" | "watch" | "unavailable";
  triggerStatus: string;
  direction: "bullish" | "neutral" | "bearish" | null;
  calculatedAt: string | null;
  currentPrice: number | null;
  firstInterestPrice: number | null;
  secondInterestPrice: number | null;
  invalidationPrice: number | null;
  sizingScore: number | null;
  riskTier: string | null;
  marginPercent: number | null;
  requestedLeverage: number | null;
  appliedLeverage: number | null;
  leverageAdjusted: boolean;
  notionalAmount: number | null;
  marginAmount: number | null;
  entryPrice: number | null;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  estimatedLiquidationPrice: number | null;
  liquidationDistancePercent: number | null;
  liquidationSafetyBufferPercent: number | null;
  liquidationSafetyStatus: string | null;
  side: "long" | "short" | null;
  unrealizedPnl: number | null;
  equity: number | null;
  error: string | null;
};

const n = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function getSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL 및 SUPABASE_SECRET_KEY가 필요합니다.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getAdaptivePositionPlanData(): Promise<AdaptivePositionPlanData> {
  const empty: AdaptivePositionPlanData = {
    status: "unavailable",
    triggerStatus: "UNAVAILABLE",
    direction: null,
    calculatedAt: null,
    currentPrice: null,
    firstInterestPrice: null,
    secondInterestPrice: null,
    invalidationPrice: null,
    sizingScore: null,
    riskTier: null,
    marginPercent: null,
    requestedLeverage: null,
    appliedLeverage: null,
    leverageAdjusted: false,
    notionalAmount: null,
    marginAmount: null,
    entryPrice: null,
    stopLossPrice: null,
    takeProfitPrice: null,
    estimatedLiquidationPrice: null,
    liquidationDistancePercent: null,
    liquidationSafetyBufferPercent: null,
    liquidationSafetyStatus: null,
    side: null,
    unrealizedPnl: null,
    equity: null,
    error: null,
  };

  try {
    const supabase = getSupabase();

    const [decisionRes, sizingRes, positionRes, equityRes] = await Promise.all([
      supabase
        .from("ai_decision_v2_snapshots")
        .select("id,calculated_at,direction,entry_plan,entry_trigger")
        .eq("symbol", "BTCUSDT")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("adaptive_position_sizing_snapshots")
        .select("id,calculated_at,decision_v2_id,sizing_status,risk_tier,sizing_score,margin_percent,leverage,margin_amount,notional_amount,apply_mode")
        .eq("symbol", "BTCUSDT")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("adaptive_paper_positions")
        .select("id,side,entry_price,stop_loss_price,take_profit_price,margin_percent,requested_leverage,leverage,leverage_adjusted,margin_amount,notional_amount,estimated_liquidation_price,liquidation_distance_percent,liquidation_safety_buffer_percent,liquidation_safety_status,opened_at")
        .eq("symbol", "BTCUSDT")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("adaptive_paper_equity_snapshots")
        .select("equity,unrealized_pnl,market_price,created_at")
        .eq("symbol", "BTCUSDT")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const errors = [
      decisionRes.error,
      sizingRes.error,
      positionRes.error,
      equityRes.error,
    ].filter(Boolean);

    if (errors.length) {
      throw new Error(errors.map((error) => error?.message).join(" | "));
    }

    const decision = decisionRes.data as any;
    const sizing = sizingRes.data as any;
    const position = positionRes.data as any;
    const equity = equityRes.data as any;

    const currentPlan =
      decision?.entry_trigger?.referencePlan ??
      decision?.entry_plan ??
      null;

    const triggerStatus = String(
      decision?.entry_trigger?.status ?? "UNAVAILABLE",
    );

    const direction =
      decision?.direction === "bullish" ||
      decision?.direction === "bearish" ||
      decision?.direction === "neutral"
        ? decision.direction
        : null;

    let status: AdaptivePositionPlanData["status"] = "unavailable";
    if (position) status = "open";
    else if (
      triggerStatus === "READY" &&
      sizing?.sizing_status === "candidate_ready"
    ) status = "ready";
    else if (decision) status = "watch";

    return {
      ...empty,
      status,
      triggerStatus,
      direction,
      calculatedAt:
        position?.opened_at ??
        sizing?.calculated_at ??
        decision?.calculated_at ??
        null,
      currentPrice:
        n(equity?.market_price) ??
        n(decision?.entry_plan?.currentPrice),
      firstInterestPrice: n(currentPlan?.firstInterestPrice),
      secondInterestPrice: n(currentPlan?.secondInterestPrice),
      invalidationPrice: n(currentPlan?.invalidationPrice),
      sizingScore: n(sizing?.sizing_score),
      riskTier: sizing?.risk_tier ?? null,
      marginPercent:
        n(position?.margin_percent) ??
        n(sizing?.margin_percent),
      requestedLeverage:
        n(position?.requested_leverage) ??
        n(sizing?.leverage),
      appliedLeverage:
        n(position?.leverage) ??
        n(sizing?.leverage),
      leverageAdjusted: Boolean(position?.leverage_adjusted),
      notionalAmount:
        n(position?.notional_amount) ??
        n(sizing?.notional_amount),
      marginAmount:
        n(position?.margin_amount) ??
        n(sizing?.margin_amount),
      entryPrice: n(position?.entry_price),
      stopLossPrice:
        n(position?.stop_loss_price) ??
        n(currentPlan?.invalidationPrice),
      takeProfitPrice: n(position?.take_profit_price),
      estimatedLiquidationPrice: n(position?.estimated_liquidation_price),
      liquidationDistancePercent: n(position?.liquidation_distance_percent),
      liquidationSafetyBufferPercent: n(position?.liquidation_safety_buffer_percent),
      liquidationSafetyStatus: position?.liquidation_safety_status ?? null,
      side: position?.side ?? null,
      unrealizedPnl: n(equity?.unrealized_pnl),
      equity: n(equity?.equity),
      error: null,
    };
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
