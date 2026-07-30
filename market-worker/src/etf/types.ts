export type EtfFlowDetail = { ticker: string; flowUsd: number };

export type EtfFlowRecord = {
  asset: "BTC" | "ETH" | "SOL" | "XRP";
  market: "US" | "HK";
  flowDate: string;
  totalFlowUsd: number;
  priceUsd: number | null;
  source: string;
  sourceTimestamp: string | null;
  rawData: unknown;
  details: EtfFlowDetail[];
};
