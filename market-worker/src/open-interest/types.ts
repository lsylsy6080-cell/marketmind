export type OIFlowState =
  | "long_building"
  | "short_building"
  | "short_covering"
  | "long_unwinding"
  | "neutral"
  | "insufficient_data";

export interface OpenInterestSnapshot {
  id?: number;
  symbol: "BTCUSDT";
  fetchedAt: string;
  price: number;
  openInterest: number;
  openInterestValue: number;
  oiChange5mPercent: number | null;
  oiChange15mPercent: number | null;
  oiChange1hPercent: number | null;
  priceChange5mPercent: number | null;
  priceChange15mPercent: number | null;
  priceChange1hPercent: number | null;
  flowState: OIFlowState;
  directionalBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  entryAdjustment: number;
  overheatAdjustment: number;
  reversalAdjustment: number;
  reasons: string[];
  strategyVersion: "open-interest-intelligence-v7.9";
}
