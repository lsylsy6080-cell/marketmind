import { supabase } from "../lib/supabase";
import {
  type Candle,
  calculateAdx,
  calculateAtr,
  calculateBollingerBands,
  calculateEma,
  calculateMacd,
  calculateMfi,
  calculateObv,
  calculateRsi,
  calculateVolumeMetrics,
} from "../indicators/technical";

interface MarketCandleRecord {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
}

function toNumber(value: number | string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`숫자 변환 실패: ${String(value)}`);
  }

  return parsed;
}

function determineTrend(
  close: number,
  ema20: number,
  ema60: number,
  ema120: number,
  ema240: number,
): string {
  if (
    close > ema20 &&
    ema20 > ema60 &&
    ema60 > ema120 &&
    ema120 > ema240
  ) {
    return "strong_bullish";
  }

  if (close > ema20 && ema20 > ema60) {
    return "bullish";
  }

  if (
    close < ema20 &&
    ema20 < ema60 &&
    ema60 < ema120 &&
    ema120 < ema240
  ) {
    return "strong_bearish";
  }

  if (close < ema20 && ema20 < ema60) {
    return "bearish";
  }

  return "neutral";
}

function determineMomentum(
  rsi: number,
  macdHistogram: number,
): string {
  if (rsi >= 60 && macdHistogram > 0) {
    return "bullish";
  }

  if (rsi <= 40 && macdHistogram < 0) {
    return "bearish";
  }

  return "neutral";
}

function determineVolatility(
  bollingerWidth: number,
): string {
  if (bollingerWidth >= 0.04) {
    return "high";
  }

  if (bollingerWidth <= 0.015) {
    return "low";
  }

  return "normal";
}

function determineMarketStructure(
  candles: Candle[],
): string {
  const recent = candles.slice(-20);

  if (recent.length < 20) {
    return "unknown";
  }

  const firstHalf = recent.slice(0, 10);
  const secondHalf = recent.slice(10);

  const firstHigh = Math.max(
    ...firstHalf.map((candle) => candle.high),
  );
  const firstLow = Math.min(
    ...firstHalf.map((candle) => candle.low),
  );

  const secondHigh = Math.max(
    ...secondHalf.map((candle) => candle.high),
  );
  const secondLow = Math.min(
    ...secondHalf.map((candle) => candle.low),
  );

  if (secondHigh > firstHigh && secondLow > firstLow) {
    return "higher_high_higher_low";
  }

  if (secondHigh < firstHigh && secondLow < firstLow) {
    return "lower_high_lower_low";
  }

  return "range";
}

export async function analyzeBtcTechnical(): Promise<void> {
  try {
    console.log("[기술지표] 분석 함수 진입");
    console.log("[기술지표] 캔들 조회 직전");

    const { data, error } = await supabase
      .from("market_candles")
      .select("open_time,open,high,low,close,volume")
      .eq("exchange", "binance")
      .eq("market_type", "spot")
      .eq("symbol", "BTCUSDT")
      .eq("timeframe", "1m")
      .eq("is_closed", true)
      .order("open_time", { ascending: false })
      .limit(500);

      console.log("[기술지표] 캔들 조회 완료", {
      count: data?.length ?? 0,
      error: error?.message ?? null,
      });

    if (error) {
      throw new Error(
        `캔들 조회 실패: ${error.message}`,
      );
    }

    if (!data || data.length < 240) {
      throw new Error(
        `기술지표 계산에 필요한 캔들이 부족합니다: ${data?.length ?? 0}개`,
      );
    }

    const records = [...data].reverse() as MarketCandleRecord[];

    const candles: Candle[] = records.map((record) => ({
      openTime: record.open_time,
      open: toNumber(record.open),
      high: toNumber(record.high),
      low: toNumber(record.low),
      close: toNumber(record.close),
      volume: toNumber(record.volume),
    }));

    console.log("[기술지표] 캔들 변환 완료", {
      candleCount: candles.length,
      oldestOpenTime: candles[0]?.openTime ?? null,
      newestOpenTime: candles[candles.length - 1]?.openTime ?? null,
    });

    const closes = candles.map((candle) => candle.close);
    const volumes = candles.map((candle) => candle.volume);
    const latestCandle = candles[candles.length - 1];

    console.log("[기술지표] 개별 지표 계산 시작");

    const ema20 = calculateEma(closes, 20);
    const ema60 = calculateEma(closes, 60);
    const ema120 = calculateEma(closes, 120);
    const ema240 = calculateEma(closes, 240);
    const rsi14 = calculateRsi(closes, 14);
    const macdResult = calculateMacd(closes);
    const atr14 = calculateAtr(candles, 14);
    const adx14 = calculateAdx(candles, 14);
    const bollinger = calculateBollingerBands(closes, 20);
    const volumeMetrics = calculateVolumeMetrics(volumes, 20);
    const obv = calculateObv(candles);
    const mfi14 = calculateMfi(candles, 14);

    console.log("[기술지표] 개별 지표 계산 완료", {
      ema20,
      ema60,
      ema120,
      ema240,
      rsi14,
      macd: macdResult.macd,
      macdSignal: macdResult.signal,
      macdHistogram: macdResult.histogram,
      atr14,
      adx14,
      bollingerWidth: bollinger.width,
      volumeRatio: volumeMetrics.volumeRatio,
      obv,
      mfi14,
    });

    const requiredValues = [
      ema20,
      ema60,
      ema120,
      ema240,
      rsi14,
      macdResult.macd,
      macdResult.signal,
      macdResult.histogram,
      atr14,
      adx14,
      bollinger.upper,
      bollinger.middle,
      bollinger.lower,
      bollinger.width,
      volumeMetrics.volumeMa,
      volumeMetrics.volumeRatio,
      obv,
      mfi14,
    ];

    if (requiredValues.some((value) => value === null)) {
      throw new Error("일부 기술지표 계산에 실패했습니다.");
    }

    const trendDirection = determineTrend(
      latestCandle.close,
      ema20!,
      ema60!,
      ema120!,
      ema240!,
    );

    const momentumDirection = determineMomentum(
      rsi14!,
      macdResult.histogram!,
    );

    const volatilityState = determineVolatility(
      bollinger.width!,
    );

    const marketStructure =
      determineMarketStructure(candles);

    const snapshot = {
      exchange: "binance",
      market_type: "spot",
      symbol: "BTCUSDT",
      timeframe: "1m",
      candle_open_time: latestCandle.openTime,
      analyzed_at: new Date().toISOString(),
      close_price: latestCandle.close,
      ema_20: ema20,
      ema_60: ema60,
      ema_120: ema120,
      ema_240: ema240,
      rsi_14: rsi14,
      macd: macdResult.macd,
      macd_signal: macdResult.signal,
      macd_histogram: macdResult.histogram,
      atr_14: atr14,
      adx_14: adx14,
      bollinger_upper: bollinger.upper,
      bollinger_middle: bollinger.middle,
      bollinger_lower: bollinger.lower,
      bollinger_width: bollinger.width,
      volume_ma_20: volumeMetrics.volumeMa,
      volume_ratio: volumeMetrics.volumeRatio,
      obv,
      mfi_14: mfi14,
      market_structure: marketStructure,
      trend_direction: trendDirection,
      momentum_direction: momentumDirection,
      volatility_state: volatilityState,
      indicator_data: {
        candle_count: candles.length,
        indicator_version: "1.0.0",
        macd_settings: {
          fast: 12,
          slow: 26,
          signal: 9,
        },
        bollinger_settings: {
          period: 20,
          deviation: 2,
        },
      },
    };

    console.log("[기술지표] 기존 스냅샷 조회 시작", {
      candleOpenTime: latestCandle.openTime,
    });

    const { data: existing, error: existingError } =
      await supabase
        .from("technical_snapshots")
        .select("id")
        .eq("exchange", "binance")
        .eq("market_type", "spot")
        .eq("symbol", "BTCUSDT")
        .eq("timeframe", "1m")
        .eq("candle_open_time", latestCandle.openTime)
        .maybeSingle();

    console.log("[기술지표] 기존 스냅샷 조회 완료", {
      exists: Boolean(existing),
      error: existingError?.message ?? null,
    });

    if (existingError) {
      throw new Error(
        `기존 스냅샷 확인 실패: ${existingError.message}`,
      );
    }

    if (existing) {
      console.log("[기술지표] 기존 스냅샷 갱신 시작", {
        id: existing.id,
      });

      const { error: updateError } = await supabase
        .from("technical_snapshots")
        .update(snapshot)
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(
          `기술지표 갱신 실패: ${updateError.message}`,
        );
      }

      console.log(
        `기존 기술지표 스냅샷을 갱신했습니다: ${latestCandle.openTime}`,
      );

      return;
    }

    console.log("[기술지표] 새 스냅샷 저장 시작");

    const { error: insertError } = await supabase
      .from("technical_snapshots")
      .insert(snapshot);

    if (insertError) {
      throw new Error(
        `기술지표 저장 실패: ${insertError.message}`,
      );
    }

    console.log(
      `새 기술지표 스냅샷을 저장했습니다: ${latestCandle.openTime}`,
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("[기술지표] 분석 실패:", message);

    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }

    throw error;
  }
}
