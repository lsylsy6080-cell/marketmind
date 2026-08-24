export type LiquidationState =
  | "short_squeeze"
  | "long_flush"
  | "mixed_cascade"
  | "quiet"
  | "insufficient_data";

export interface LiquidationMinuteSnapshot {
  symbol: "BTCUSDT";
  bucketTime: string;
  startedAt: string;
  endedAt: string;
  eventCount: number;
  longLiquidationUsd: number;
  shortLiquidationUsd: number;
  totalLiquidationUsd: number;
  dominanceRatio: number;
  dominantSide: "longs" | "shorts" | "balanced" | "none";
  firstPrice: number | null;
  lastPrice: number | null;
  priceChangePercent: number | null;
  burstMultiple: number | null;
  state: LiquidationState;
  directionalBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  entryAdjustment: number;
  overheatAdjustment: number;
  reversalAdjustment: number;
  reasons: string[];
  streamHealthy: boolean;
  strategyVersion: "liquidation-intelligence-v7.10";
}
