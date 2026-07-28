import { supabase } from "../lib/supabase";
import {
  calculateTechnicalMarketScore,
  type TechnicalSnapshotInput,
} from "../scorers/technical-score";

interface TechnicalSnapshotRecord {
  candle_open_time: string;
  close_price: number | string;
  ema_20: number | string;
  ema_60: number | string;
  ema_120: number | string;
  ema_240: number | string;
  rsi_14: number | string;
  macd: number | string;
  macd_signal: number | string;
  macd_histogram: number | string;
  atr_14: number | string;
  adx_14: number | string;
  bollinger_width: number | string;
  volume_ratio: number | string;
  mfi_14: number | string;
  market_structure: string;
  trend_direction: string;
  momentum_direction: string;
  volatility_state: string;
}

const STRATEGY_VERSION = "btc-market-v1";

function toNumber(
  value: number | string,
  fieldName: string,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${fieldName} 숫자 변환 실패: ${String(value)}`,
    );
  }

  return parsed;
}

function mapSnapshot(
  record: TechnicalSnapshotRecord,
): TechnicalSnapshotInput {
  return {
    close_price: toNumber(
      record.close_price,
      "close_price",
    ),
    ema_20: toNumber(record.ema_20, "ema_20"),
    ema_60: toNumber(record.ema_60, "ema_60"),
    ema_120: toNumber(record.ema_120, "ema_120"),
    ema_240: toNumber(record.ema_240, "ema_240"),
    rsi_14: toNumber(record.rsi_14, "rsi_14"),
    macd: toNumber(record.macd, "macd"),
    macd_signal: toNumber(
      record.macd_signal,
      "macd_signal",
    ),
    macd_histogram: toNumber(
      record.macd_histogram,
      "macd_histogram",
    ),
    atr_14: toNumber(record.atr_14, "atr_14"),
    adx_14: toNumber(record.adx_14, "adx_14"),
    bollinger_width: toNumber(
      record.bollinger_width,
      "bollinger_width",
    ),
    volume_ratio: toNumber(
      record.volume_ratio,
      "volume_ratio",
    ),
    mfi_14: toNumber(record.mfi_14, "mfi_14"),
    market_structure: record.market_structure,
    trend_direction: record.trend_direction,
    momentum_direction: record.momentum_direction,
    volatility_state: record.volatility_state,
  };
}

export async function generateBtcMarketScore(): Promise<void> {
  console.log("[시장점수] 최신 기술지표 조회 시작");

  const { data, error } = await supabase
    .from("technical_snapshots")
    .select(
      [
        "candle_open_time",
        "close_price",
        "ema_20",
        "ema_60",
        "ema_120",
        "ema_240",
        "rsi_14",
        "macd",
        "macd_signal",
        "macd_histogram",
        "atr_14",
        "adx_14",
        "bollinger_width",
        "volume_ratio",
        "mfi_14",
        "market_structure",
        "trend_direction",
        "momentum_direction",
        "volatility_state",
      ].join(","),
    )
    .eq("exchange", "binance")
    .eq("market_type", "spot")
    .eq("symbol", "BTCUSDT")
    .eq("timeframe", "1m")
    .order("candle_open_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `최신 기술지표 조회 실패: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error("점수 계산에 사용할 기술지표가 없습니다.");
  }

  const record = data as unknown as TechnicalSnapshotRecord;

  console.log("[시장점수] 점수 계산 시작", {
    candleOpenTime: record.candle_open_time,
  });

  const result = calculateTechnicalMarketScore(
    mapSnapshot(record),
  );

  const scoreRow = {
    symbol: "BTCUSDT",
    analyzed_at: record.candle_open_time,
    market_regime: result.marketRegime,
    direction: result.direction,
    total_score: result.totalScore,
    confidence: result.confidence,
    trend_score: result.trendScore,
    momentum_score: result.momentumScore,
    volume_score: result.volumeScore,
    structure_score: result.structureScore,
    volatility_score: result.volatilityScore,
    derivatives_score: result.derivativesScore,
    trading_permission: result.tradingPermission,
    risk_level: result.riskLevel,
    strategy_version: STRATEGY_VERSION,
    score_details: result.details,
  };

  console.log("[시장점수] 계산 완료", {
    totalScore: result.totalScore,
    confidence: result.confidence,
    direction: result.direction,
    marketRegime: result.marketRegime,
    tradingPermission: result.tradingPermission,
    riskLevel: result.riskLevel,
  });

  const { data: existing, error: existingError } =
    await supabase
      .from("market_scores")
      .select("id")
      .eq("symbol", "BTCUSDT")
      .eq("strategy_version", STRATEGY_VERSION)
      .eq("analyzed_at", record.candle_open_time)
      .maybeSingle();

  if (existingError) {
    throw new Error(
      `기존 시장점수 확인 실패: ${existingError.message}`,
    );
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("market_scores")
      .update(scoreRow)
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(
        `시장점수 갱신 실패: ${updateError.message}`,
      );
    }

    console.log(
      `[시장점수] 기존 점수를 갱신했습니다: ${record.candle_open_time}`,
    );
    return;
  }

  const { error: insertError } = await supabase
    .from("market_scores")
    .insert(scoreRow);

  if (insertError) {
    throw new Error(
      `시장점수 저장 실패: ${insertError.message}`,
    );
  }

  console.log(
    `[시장점수] 새 점수를 저장했습니다: ${record.candle_open_time}`,
  );
}
