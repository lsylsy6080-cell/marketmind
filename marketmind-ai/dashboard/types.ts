export type MarketDirection = "bullish" | "neutral" | "bearish";
export type MarketSignal =
  | "strong_bullish"
  | "bullish"
  | "watch"
  | "caution"
  | "bearish"
  | "strong_bearish";
export type RiskLevel = "low" | "medium" | "high" | "extreme";
export type ConflictLevel = "low" | "medium" | "high";
export type ComponentName = "funding" | "etf" | "news";

export interface DirectionVotes {
  bullish: number;
  neutral: number;
  bearish: number;
}

export interface ComponentBreakdown {
  score: number;
  confidence: number;
  direction: MarketDirection;
  configured_weight: number;
  effective_weight: number;
  freshness_factor: number;
  contribution: number;
  age_hours: number;
  observed_at: string;
}

export type Breakdown = Partial<Record<ComponentName, ComponentBreakdown>>;

export interface MarketIntelligenceRow {
  id: number | string;
  symbol: string;
  calculated_at: string;
  market_score: number;
  raw_score: number | null;
  consensus_adjustment: number | null;
  confidence: number;
  direction: MarketDirection;
  signal: MarketSignal;
  risk_level: RiskLevel | null;
  conflict_level: ConflictLevel | null;
  consensus_strength: number | null;
  direction_votes: DirectionVotes | null;
  breakdown: Breakdown | null;
  summary: string | null;
  reasons: string[] | null;
  component_count: number | null;
  strategy_version: string | null;
}

export interface DashboardData {
  latest: MarketIntelligenceRow | null;
  history: MarketIntelligenceRow[];
  error: string | null;
}
