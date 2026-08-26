export type EtfFlowDirection = "inflow" | "outflow" | "flat";
export type PriceDirection = "up" | "down" | "flat" | "unavailable";

export type EtfPriceResponseState =
  | "confirmed_inflow"
  | "inflow_selling_pressure"
  | "inflow_absorption"
  | "confirmed_outflow"
  | "outflow_absorbed"
  | "outflow_absorption"
  | "flow_neutral"
  | "collecting";

export interface PriceReaction {
  horizonHours: 6 | 12 | 24 | 48;
  priceUsd: number | null;
  returnPercent: number | null;
  direction: PriceDirection;
}

export interface EtfFlowPriceResponseInput {
  asset: "BTC";
  flowDate: string;
  observedAt: string;
  flowUsd: number;
  anchorPriceUsd: number;
  reactions: PriceReaction[];
}

export interface EtfFlowPriceResponseResult {
  asset: "BTC";
  flowDate: string;
  observedAt: string;
  flowUsd: number;
  flowDirection: EtfFlowDirection;
  flowStrength: "low" | "medium" | "high" | "extreme";
  anchorPriceUsd: number;
  reactions: PriceReaction[];
  state: EtfPriceResponseState;
  score: number;
  confidence: number;
  bullishEvidence: number;
  bearishEvidence: number;
  summary: string;
  strategyVersion: "btc-etf-price-response-v1";
}
