export type RegimeDirection = "bullish" | "neutral" | "bearish";

export type MarketRegime =
  | "strong_bull_trend"
  | "bull_trend"
  | "range"
  | "transition"
  | "high_volatility"
  | "bear_trend"
  | "strong_bear_trend";

export type RegimeRiskLevel = "low" | "normal" | "high";
export type VolatilityState = "low" | "normal" | "high";
export type RegimeTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export interface TimeframeRegimeMetrics {
  timeframe: RegimeTimeframe;
  weight: number;
  observedAt: string;
  close: number;
  ema20: number;
  ema60: number;
  ema120: number;
  rsi14: number;
  adx14: number;
  atrPercent: number;
  bollingerWidth: number;
  return20Percent: number;
  directionScore: number;
  direction: RegimeDirection;
  volatility: VolatilityState;
}

export interface MarketRegimeResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  bucketTime: string;
  regime: MarketRegime;
  directionBias: RegimeDirection;
  confidence: number;
  trendScore: number;
  alignmentScore: number;
  weightedAdx: number;
  highVolatilityWeight: number;
  riskLevel: RegimeRiskLevel;
  timeframeDetails: TimeframeRegimeMetrics[];
  reasons: string[];
  strategyVersion: "market-regime-v2.0";
}
