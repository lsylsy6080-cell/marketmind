import { supabase } from "../lib/supabase";
import type { MarketRegimeResult, RegimeTimeframe } from "./types";
import type { Candle } from "../indicators/technical";

interface MarketCandleRecord {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
}

function toNumber(value: number | string, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} 숫자 변환 실패: ${String(value)}`);
  return parsed;
}

export async function loadRegimeCandles(
  timeframe: RegimeTimeframe,
  limit = 300,
): Promise<Candle[]> {
  const { data, error } = await supabase
    .from("market_candles")
    .select("open_time,open,high,low,close,volume")
    .eq("exchange", "binance")
    .eq("market_type", "spot")
    .eq("symbol", "BTCUSDT")
    .eq("timeframe", timeframe)
    .eq("is_closed", true)
    .order("open_time", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`[Regime V2] ${timeframe} 캔들 조회 실패: ${error.message}`);

  const rows = [...((data ?? []) as MarketCandleRecord[])].reverse();
  return rows.map((row) => ({
    openTime: row.open_time,
    open: toNumber(row.open, `${timeframe}.open`),
    high: toNumber(row.high, `${timeframe}.high`),
    low: toNumber(row.low, `${timeframe}.low`),
    close: toNumber(row.close, `${timeframe}.close`),
    volume: toNumber(row.volume, `${timeframe}.volume`),
  }));
}

export async function saveMarketRegime(result: MarketRegimeResult): Promise<void> {
  const { error } = await supabase.from("market_regime_snapshots").upsert(
    {
      symbol: result.symbol,
      bucket_time: result.bucketTime,
      calculated_at: result.calculatedAt,
      regime: result.regime,
      direction_bias: result.directionBias,
      confidence: result.confidence,
      trend_score: result.trendScore,
      alignment_score: result.alignmentScore,
      weighted_adx: result.weightedAdx,
      high_volatility_weight: result.highVolatilityWeight,
      risk_level: result.riskLevel,
      timeframe_details: result.timeframeDetails,
      reasons: result.reasons,
      strategy_version: result.strategyVersion,
    },
    {
      onConflict: "symbol,bucket_time,strategy_version",
      ignoreDuplicates: false,
    },
  );

  if (error) throw new Error(`[Regime V2] 저장 실패: ${error.message}`);
}
