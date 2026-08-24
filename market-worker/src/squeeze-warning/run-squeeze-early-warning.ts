import "dotenv/config";
import { supabase } from "../lib/supabase";
import { calculateSqueezeEarlyWarning } from "./SqueezeEarlyWarningEngine";
import type { SqueezeHistoryPoint } from "./SqueezeEarlyWarningEngine";
import type { SqueezeWarningPhase } from "./types";


const n = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function historyPoint(row: any, side: "long" | "short"): SqueezeHistoryPoint | null {
  const obj = side === "long" ? row.long_squeeze : row.short_squeeze;
  if (!obj || typeof obj !== "object") return null;

  const probability = n(
    side === "long" ? row.long_squeeze_probability : row.short_squeeze_probability,
  );
  const triggerPressure = n(obj.triggerPressure);
  const liquidationConfirmation = n(obj.liquidationConfirmation);
  const nearestZoneIntensity = n(obj.nearestZoneIntensity);

  if (
    probability == null ||
    triggerPressure == null ||
    liquidationConfirmation == null ||
    nearestZoneIntensity == null
  ) return null;

  return {
    probability,
    triggerPressure,
    liquidationConfirmation,
    nearestZoneIntensity,
    calculatedAt: String(row.calculated_at),
  };
}

export async function runSqueezeEarlyWarning() {
  const [
    { data: squeezeRows, error: squeezeError },
    { data: liquidation, error: liquidationError },
    { data: previousWarning, error: warningError },
  ] = await Promise.all([
    supabase
      .from("squeeze_probability_snapshots")
      .select("calculated_at,long_squeeze_probability,short_squeeze_probability,long_squeeze,short_squeeze")
      .eq("symbol", "BTCUSDT")
      .order("calculated_at", { ascending: false })
      .limit(10),
    supabase
      .from("btc_liquidation_snapshots")
      .select("state,confidence,bucket_time")
      .eq("symbol", "BTCUSDT")
      .order("bucket_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("squeeze_early_warning_snapshots")
      .select("long_phase,short_phase,calculated_at")
      .eq("symbol", "BTCUSDT")
      .order("calculated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (squeezeError) throw new Error(`[Squeeze Warning] probability 조회 실패: ${squeezeError.message}`);
  if (liquidationError) throw new Error(`[Squeeze Warning] liquidation 조회 실패: ${liquidationError.message}`);
  if (warningError) throw new Error(`[Squeeze Warning] previous warning 조회 실패: ${warningError.message}`);

  const rows = squeezeRows ?? [];
  if (!rows.length) {
    return {
      status: "warming_up",
      reason: "Squeeze Probability snapshot이 아직 없습니다.",
      result: null,
    };
  }

  const latest = rows[0] as any;
  const latestLong = historyPoint(latest, "long");
  const latestShort = historyPoint(latest, "short");

  if (!latestLong || !latestShort) {
    return {
      status: "warming_up",
      reason: "Squeeze Probability 상세 데이터가 아직 충분하지 않습니다.",
      result: null,
    };
  }

  const historyLong = rows
    .slice(1)
    .map((row: any) => historyPoint(row, "long"))
    .filter((x): x is SqueezeHistoryPoint => x != null);

  const historyShort = rows
    .slice(1)
    .map((row: any) => historyPoint(row, "short"))
    .filter((x): x is SqueezeHistoryPoint => x != null);

  const currentPriceResult = await supabase
    .from("squeeze_probability_snapshots")
    .select("current_price")
    .eq("symbol", "BTCUSDT")
    .order("calculated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (currentPriceResult.error) {
    throw new Error(`[Squeeze Warning] current price 조회 실패: ${currentPriceResult.error.message}`);
  }

  const currentPrice = n(currentPriceResult.data?.current_price);
  if (currentPrice == null || currentPrice <= 0) {
    throw new Error("[Squeeze Warning] current price가 유효하지 않습니다.");
  }

  const validPhase = (value: unknown): SqueezeWarningPhase | null =>
    ["WATCH", "BUILDING", "IMMINENT", "ACTIVE", "EXHAUSTION"].includes(String(value))
      ? String(value) as SqueezeWarningPhase
      : null;

  const result = calculateSqueezeEarlyWarning({
    currentPrice,
    longSqueeze: {
      current: latestLong,
      history: historyLong,
      previousPhase: validPhase(previousWarning?.long_phase),
      liquidationState: liquidation?.state ?? null,
      liquidationConfidence: n(liquidation?.confidence),
    },
    shortSqueeze: {
      current: latestShort,
      history: historyShort,
      previousPhase: validPhase(previousWarning?.short_phase),
      liquidationState: liquidation?.state ?? null,
      liquidationConfidence: n(liquidation?.confidence),
    },
  });

  const bucket = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const { error: saveError } = await supabase
    .from("squeeze_early_warning_snapshots")
    .upsert({
      symbol: "BTCUSDT",
      bucket_time: bucket,
      calculated_at: result.calculatedAt,
      current_price: result.currentPrice,
      long_phase: result.longSqueeze.phase,
      short_phase: result.shortSqueeze.phase,
      long_alert_score: result.longSqueeze.alertScore,
      short_alert_score: result.shortSqueeze.alertScore,
      dominant_warning: result.dominantWarning,
      long_warning: result.longSqueeze,
      short_warning: result.shortSqueeze,
      strategy_version: result.strategyVersion,
    }, { onConflict: "symbol,bucket_time" });

  if (saveError) {
    throw new Error(`[Squeeze Warning] 저장 실패: ${saveError.message}`);
  }

  return { status: "ok", reason: null, result };
}
