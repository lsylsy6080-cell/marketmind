import {
  calculateAdx,
  calculateAtr,
  calculateBollingerBands,
  calculateEma,
  calculateRsi,
  type Candle,
} from "../indicators/technical";
import type {
  MarketRegime,
  MarketRegimeResult,
  RegimeDirection,
  RegimeRiskLevel,
  RegimeTimeframe,
  TimeframeRegimeMetrics,
  VolatilityState,
} from "./types";

const STRATEGY_VERSION = "market-regime-v2.0" as const;

export const REGIME_TIMEFRAMES: Array<{
  timeframe: RegimeTimeframe;
  weight: number;
  highAtrPercent: number;
  highBollingerWidth: number;
  lowAtrPercent: number;
  lowBollingerWidth: number;
}> = [
  { timeframe: "1m", weight: 0.1, highAtrPercent: 0.25, highBollingerWidth: 0.02, lowAtrPercent: 0.07, lowBollingerWidth: 0.006 },
  { timeframe: "5m", weight: 0.15, highAtrPercent: 0.45, highBollingerWidth: 0.03, lowAtrPercent: 0.12, lowBollingerWidth: 0.01 },
  { timeframe: "15m", weight: 0.2, highAtrPercent: 0.7, highBollingerWidth: 0.045, lowAtrPercent: 0.2, lowBollingerWidth: 0.015 },
  { timeframe: "1h", weight: 0.25, highAtrPercent: 1.2, highBollingerWidth: 0.07, lowAtrPercent: 0.35, lowBollingerWidth: 0.025 },
  { timeframe: "4h", weight: 0.2, highAtrPercent: 2.5, highBollingerWidth: 0.12, lowAtrPercent: 0.7, lowBollingerWidth: 0.04 },
  { timeframe: "1d", weight: 0.1, highAtrPercent: 5, highBollingerWidth: 0.22, lowAtrPercent: 1.5, lowBollingerWidth: 0.08 },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function scoreDirection(score: number): RegimeDirection {
  if (score >= 20) return "bullish";
  if (score <= -20) return "bearish";
  return "neutral";
}

function classifyVolatility(
  timeframe: RegimeTimeframe,
  atrPercent: number,
  bollingerWidth: number,
): VolatilityState {
  const config = REGIME_TIMEFRAMES.find((item) => item.timeframe === timeframe);
  if (!config) throw new Error(`지원하지 않는 Regime timeframe: ${timeframe}`);

  if (
    atrPercent >= config.highAtrPercent ||
    bollingerWidth >= config.highBollingerWidth
  ) {
    return "high";
  }

  if (
    atrPercent <= config.lowAtrPercent &&
    bollingerWidth <= config.lowBollingerWidth
  ) {
    return "low";
  }

  return "normal";
}

export function calculateTimeframeRegimeMetrics(params: {
  timeframe: RegimeTimeframe;
  weight: number;
  candles: Candle[];
}): TimeframeRegimeMetrics {
  if (params.candles.length < 140) {
    throw new Error(
      `${params.timeframe} Regime 계산에 필요한 캔들이 부족합니다: ${params.candles.length}개`,
    );
  }

  const closes = params.candles.map((candle) => candle.close);
  const latest = params.candles[params.candles.length - 1];
  const ema20 = calculateEma(closes, 20);
  const ema60 = calculateEma(closes, 60);
  const ema120 = calculateEma(closes, 120);
  const rsi14 = calculateRsi(closes, 14);
  const adx14 = calculateAdx(params.candles, 14);
  const atr14 = calculateAtr(params.candles, 14);
  const bollinger = calculateBollingerBands(closes, 20);

  if (
    ema20 === null ||
    ema60 === null ||
    ema120 === null ||
    rsi14 === null ||
    adx14 === null ||
    atr14 === null ||
    bollinger.width === null
  ) {
    throw new Error(`${params.timeframe} Regime 기술지표 계산에 실패했습니다.`);
  }

  const referenceIndex = Math.max(0, closes.length - 21);
  const referenceClose = closes[referenceIndex];
  const return20Percent =
    referenceClose > 0 ? ((latest.close / referenceClose) - 1) * 100 : 0;
  const atrPercent = latest.close > 0 ? (atr14 / latest.close) * 100 : 0;

  // 방향 점수는 단순 가격 변화 하나가 아니라 EMA 배열 + 모멘텀 + 20봉 수익률을 합산합니다.
  let directionScore = 0;
  directionScore += latest.close >= ema20 ? 22 : -22;
  directionScore += ema20 >= ema60 ? 28 : -28;
  directionScore += ema60 >= ema120 ? 25 : -25;
  directionScore += clamp((rsi14 - 50) * 1.2, -12, 12);
  directionScore += clamp(return20Percent * 2, -13, 13);
  directionScore = clamp(directionScore, -100, 100);

  return {
    timeframe: params.timeframe,
    weight: params.weight,
    observedAt: latest.openTime,
    close: round(latest.close, 4),
    ema20: round(ema20, 4),
    ema60: round(ema60, 4),
    ema120: round(ema120, 4),
    rsi14: round(rsi14),
    adx14: round(adx14),
    atrPercent: round(atrPercent, 4),
    bollingerWidth: round(bollinger.width, 6),
    return20Percent: round(return20Percent, 4),
    directionScore: round(directionScore),
    direction: scoreDirection(directionScore),
    volatility: classifyVolatility(
      params.timeframe,
      atrPercent,
      bollinger.width,
    ),
  };
}

function determineRegime(params: {
  trendScore: number;
  weightedAdx: number;
  alignmentScore: number;
  highVolatilityWeight: number;
}): MarketRegime {
  const absTrend = Math.abs(params.trendScore);

  if (params.highVolatilityWeight >= 45 && params.weightedAdx < 25) {
    return "high_volatility";
  }

  if (
    params.trendScore >= 50 &&
    params.weightedAdx >= 28 &&
    params.alignmentScore >= 70
  ) {
    return "strong_bull_trend";
  }
  if (
    params.trendScore <= -50 &&
    params.weightedAdx >= 28 &&
    params.alignmentScore >= 70
  ) {
    return "strong_bear_trend";
  }
  if (params.trendScore >= 25 && params.weightedAdx >= 22) {
    return "bull_trend";
  }
  if (params.trendScore <= -25 && params.weightedAdx >= 22) {
    return "bear_trend";
  }
  if (absTrend < 25 && params.weightedAdx < 20) {
    return "range";
  }
  return "transition";
}

function determineRisk(params: {
  regime: MarketRegime;
  alignmentScore: number;
  highVolatilityWeight: number;
}): RegimeRiskLevel {
  if (
    params.regime === "high_volatility" ||
    params.highVolatilityWeight >= 60 ||
    params.alignmentScore < 45
  ) {
    return "high";
  }
  if (params.alignmentScore < 65 || params.highVolatilityWeight >= 35) {
    return "normal";
  }
  return "low";
}

function floorToFiveMinutes(date: Date): string {
  const bucket = new Date(date);
  bucket.setUTCSeconds(0, 0);
  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 5) * 5);
  return bucket.toISOString();
}

export function aggregateMarketRegime(
  metrics: TimeframeRegimeMetrics[],
  now = new Date(),
): MarketRegimeResult {
  if (metrics.length < 4) {
    throw new Error(`Market Regime V2에는 최소 4개 시간봉이 필요합니다. 현재 ${metrics.length}개입니다.`);
  }

  const totalWeight = metrics.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) throw new Error("Market Regime V2 가중치 합계가 0입니다.");

  const trendScore = metrics.reduce(
    (sum, item) => sum + item.directionScore * (item.weight / totalWeight),
    0,
  );
  const weightedAdx = metrics.reduce(
    (sum, item) => sum + item.adx14 * (item.weight / totalWeight),
    0,
  );
  const highVolatilityWeight =
    metrics
      .filter((item) => item.volatility === "high")
      .reduce((sum, item) => sum + item.weight, 0) /
    totalWeight *
    100;

  const directionBias = scoreDirection(trendScore);
  const alignedWeight = metrics.reduce((sum, item) => {
    if (directionBias === "neutral") {
      return sum + (item.direction === "neutral" ? item.weight : 0);
    }
    return sum + (item.direction === directionBias ? item.weight : 0);
  }, 0);
  const alignmentScore = (alignedWeight / totalWeight) * 100;

  const regime = determineRegime({
    trendScore,
    weightedAdx,
    alignmentScore,
    highVolatilityWeight,
  });

  // 신뢰도는 방향성 크기, 다중 시간봉 정렬, ADX 추세 강도, 시간봉 커버리지를 혼합합니다.
  const directionStrength = Math.min(Math.abs(trendScore), 100);
  const adxStrength = clamp((weightedAdx / 40) * 100, 0, 100);
  const coverage = clamp((metrics.length / REGIME_TIMEFRAMES.length) * 100, 0, 100);
  const confidence =
    alignmentScore * 0.4 +
    adxStrength * 0.25 +
    directionStrength * 0.2 +
    coverage * 0.15;

  const riskLevel = determineRisk({
    regime,
    alignmentScore,
    highVolatilityWeight,
  });

  const sorted = [...metrics].sort(
    (left, right) =>
      REGIME_TIMEFRAMES.findIndex((item) => item.timeframe === left.timeframe) -
      REGIME_TIMEFRAMES.findIndex((item) => item.timeframe === right.timeframe),
  );

  const reasons = [
    `MTF 방향 ${directionBias} · trend=${round(trendScore)} · alignment=${round(alignmentScore)}%`,
    `가중 ADX ${round(weightedAdx)} · 고변동 시간봉 비중 ${round(highVolatilityWeight)}%`,
    ...sorted.map(
      (item) =>
        `${item.timeframe} ${item.direction} score=${item.directionScore} ADX=${item.adx14} RSI=${item.rsi14} vol=${item.volatility}`,
    ),
  ];

  return {
    symbol: "BTCUSDT",
    calculatedAt: now.toISOString(),
    bucketTime: floorToFiveMinutes(now),
    regime,
    directionBias,
    confidence: round(clamp(confidence, 0, 100)),
    trendScore: round(trendScore),
    alignmentScore: round(alignmentScore),
    weightedAdx: round(weightedAdx),
    highVolatilityWeight: round(highVolatilityWeight),
    riskLevel,
    timeframeDetails: sorted,
    reasons,
    strategyVersion: STRATEGY_VERSION,
  };
}
