export interface MetricValue {
  value: number | null;
  unit: string;
  source: string;
  observed_at: string;
}
export interface SourceStatus {
  ok: boolean;
  fetched_at: string;
  error: string | null;
  metric_count: number;
}
export interface OnchainSignal {
  key: string;
  label: string;
  score: number | null;
  reason: string;
}
export interface OnchainSnapshot {
  asset: 'BTC';
  snapshot_hour: string;
  calculated_at: string;
  onchain_score: number | null;
  onchain_confidence: number;
  direction: 'bullish' | 'neutral' | 'bearish';
  metrics: Record<string, MetricValue>;
  signals: OnchainSignal[];
  sources: Record<string, SourceStatus>;
  raw_data: Record<string, unknown>;
  strategy_version: string;
}
export const ONCHAIN_VERSION = 'btc-public-onchain-v1';
export const DAILY_MAX_AGE_MS = 72 * 60 * 60_000;
