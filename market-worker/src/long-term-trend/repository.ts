import { supabase } from "../lib/supabase";
import type { TrendCandle, TrendSummary } from "./engine";

export type StoredTrendTimeframe = "4h" | "1d" | "1w";

type MarketCandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string | null;
};

export type LongTermTrendSnapshotInsert = {
  exchange: "binance";
  market_type: "spot";
  symbol: "BTCUSDT";
  engine_version: string;
  snapshot_hour: string;
  market_price: number;
  weekly_score: number;
  daily_score: number;
  four_hour_score: number;
  combined_score: number;
  combined_label: string;
  combined_confidence: number;
  combined_risk: number;
  trend_continuation: number;
  reversal_risk: number;
  weekly_label: string;
  daily_label: string;
  four_hour_label: string;
  weekly_structure: string;
  daily_structure: string;
  four_hour_structure: string;
  weekly_data_quality: number;
  daily_data_quality: number;
  four_hour_data_quality: number;
  reference_timeframe: "4h" | "1d" | "1w";
  reference_support: number | null;
  reference_resistance: number | null;
  long_term_support: number | null;
  long_term_resistance: number | null;
  current_support: number | null;
  current_resistance: number | null;
  current_support_source: "4h" | "1d" | null;
  current_resistance_source: "4h" | "1d" | null;
  current_support_distance_pct: number | null;
  current_resistance_distance_pct: number | null;
  current_range_width_pct: number | null;
  neutral_range_eligible: boolean;
  scenario_activation_reason: Record<string, unknown>;
  bullish_scenario_strength: number;
  neutral_scenario_strength: number;
  bearish_scenario_strength: number;
  bullish_scenario_state: string;
  neutral_scenario_state: string;
  bearish_scenario_state: string;
  weekly_structure_event: Record<string, unknown> | null;
  daily_structure_event: Record<string, unknown> | null;
  four_hour_structure_event: Record<string, unknown> | null;
  scenario_summary: Record<string, unknown>;
  snapshot_payload: Record<string, unknown>;
};

function toNumber(value: number | string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toTrendCandle(row: MarketCandleRow): TrendCandle {
  return {
    time: Math.floor(new Date(row.open_time).getTime() / 1000),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume),
  };
}

function validCandle(candle: TrendCandle): boolean {
  return (
    Number.isFinite(candle.time) &&
    candle.time > 0 &&
    candle.open > 0 &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0
  );
}

export async function loadTrendCandles(
  timeframe: StoredTrendTimeframe,
  targetCount: number,
): Promise<TrendCandle[]> {
  const pageSize = 1000;
  const rows: MarketCandleRow[] = [];

  for (let offset = 0; offset < targetCount; offset += pageSize) {
    const end = Math.min(targetCount, offset + pageSize) - 1;

    const { data, error } = await supabase
      .from("market_candles")
      .select("open_time,open,high,low,close,volume")
      .eq("exchange", "binance")
      .eq("market_type", "spot")
      .eq("symbol", "BTCUSDT")
      .eq("timeframe", timeframe)
      .eq("is_closed", true)
      .order("open_time", { ascending: false })
      .range(offset, end);

    if (error) {
      throw new Error(
        `[long-term-trend] ${timeframe} 캔들 조회 실패: ${error.message}`,
      );
    }

    const page = (data ?? []) as MarketCandleRow[];
    rows.push(...page);

    if (page.length < end - offset + 1) break;
  }

  const candles = rows
    .map(toTrendCandle)
    .filter(validCandle)
    .sort((a, b) => a.time - b.time);

  const deduped = new Map<number, TrendCandle>();
  for (const candle of candles) deduped.set(candle.time, candle);
  return [...deduped.values()].sort((a, b) => a.time - b.time);
}

export async function getLatestSpotPrice(): Promise<number> {
  const { data, error } = await supabase
    .from("market_candles")
    .select("close")
    .eq("exchange", "binance")
    .eq("market_type", "spot")
    .eq("symbol", "BTCUSDT")
    .eq("timeframe", "1m")
    .eq("is_closed", true)
    .order("open_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`[long-term-trend] 최신 BTC 가격 조회 실패: ${error.message}`);
  }

  const price = Number(data?.close ?? 0);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("[long-term-trend] 최신 BTC 가격이 유효하지 않습니다.");
  }

  return price;
}

export async function findSnapshotId(
  engineVersion: string,
  snapshotHour: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("long_term_trend_snapshots")
    .select("id")
    .eq("exchange", "binance")
    .eq("market_type", "spot")
    .eq("symbol", "BTCUSDT")
    .eq("engine_version", engineVersion)
    .eq("snapshot_hour", snapshotHour)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[long-term-trend] 기존 스냅샷 확인 실패: ${error.message}`,
    );
  }

  return data?.id == null ? null : Number(data.id);
}

export async function insertSnapshot(
  row: LongTermTrendSnapshotInsert,
): Promise<number> {
  const { data, error } = await supabase
    .from("long_term_trend_snapshots")
    .upsert(row, {
      onConflict: "exchange,market_type,symbol,engine_version,snapshot_hour",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`[long-term-trend] 스냅샷 저장 실패: ${error.message}`);
  }

  return Number(data.id);
}

export function lastStructureEvent(summary: TrendSummary): Record<string, unknown> | null {
  const event = summary.events.at(-1);
  if (!event) return null;
  return {
    time: event.time,
    price: event.price,
    type: event.type,
    direction: event.direction,
  };
}
