import assert from "node:assert/strict";
import { aggregateMarketRegime } from "./MarketRegimeEngine";
import type { TimeframeRegimeMetrics } from "./types";

function metric(
  timeframe: TimeframeRegimeMetrics["timeframe"],
  weight: number,
  directionScore: number,
  adx14: number,
  volatility: TimeframeRegimeMetrics["volatility"] = "normal",
): TimeframeRegimeMetrics {
  return {
    timeframe,
    weight,
    observedAt: "2026-08-21T00:00:00.000Z",
    close: 75000,
    ema20: 74900,
    ema60: 74500,
    ema120: 74000,
    rsi14: directionScore > 0 ? 62 : directionScore < 0 ? 38 : 50,
    adx14,
    atrPercent: 0.5,
    bollingerWidth: 0.03,
    return20Percent: directionScore / 20,
    directionScore,
    direction: directionScore >= 20 ? "bullish" : directionScore <= -20 ? "bearish" : "neutral",
    volatility,
  };
}

const weights = [
  ["1m", 0.1],
  ["5m", 0.15],
  ["15m", 0.2],
  ["1h", 0.25],
  ["4h", 0.2],
  ["1d", 0.1],
] as const;

{
  const result = aggregateMarketRegime(
    weights.map(([tf, w]) => metric(tf, w, 75, 34)),
    new Date("2026-08-21T03:02:17.000Z"),
  );
  assert.equal(result.regime, "strong_bull_trend");
  assert.equal(result.directionBias, "bullish");
  assert.equal(result.alignmentScore, 100);
  assert.equal(result.bucketTime, "2026-08-21T03:00:00.000Z");
  console.log("[PASS] 강한 다중시간봉 상승 추세를 분류한다");
}

{
  const result = aggregateMarketRegime(
    weights.map(([tf, w]) => metric(tf, w, -72, 33)),
  );
  assert.equal(result.regime, "strong_bear_trend");
  assert.equal(result.directionBias, "bearish");
  console.log("[PASS] 강한 다중시간봉 하락 추세를 분류한다");
}

{
  const result = aggregateMarketRegime(
    weights.map(([tf, w]) => metric(tf, w, 5, 15)),
  );
  assert.equal(result.regime, "range");
  assert.equal(result.directionBias, "neutral");
  console.log("[PASS] 저ADX·저방향성 구간을 횡보로 분류한다");
}

{
  const result = aggregateMarketRegime(
    weights.map(([tf, w], index) =>
      metric(tf, w, index % 2 === 0 ? 55 : -55, 22, index < 4 ? "high" : "normal"),
    ),
  );
  assert.equal(result.regime, "high_volatility");
  assert.equal(result.riskLevel, "high");
  console.log("[PASS] 방향 충돌이 큰 고변동 구간을 별도로 분류한다");
}
