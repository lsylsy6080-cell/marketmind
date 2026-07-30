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

export interface MarketComponent {
  name: ComponentName;
  score: number;
  confidence: number;
  direction: MarketDirection;
  observedAt: string;
  ageHours: number;
  configuredWeight: number;
  effectiveWeight: number;
  freshnessFactor: number;
  isFresh: boolean;
  contribution?: number;
  directionalContribution?: number;
  sourceId?: string | number | null;
  details?: Record<string, unknown>;
}

export interface DirectionVotes {
  bullish: number;
  neutral: number;
  bearish: number;
}

export interface MarketIntelligenceResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  score: number;
  rawScore: number;
  consensusAdjustment: number;
  confidence: number;
  direction: MarketDirection;
  signal: MarketSignal;
  riskLevel: RiskLevel;
  conflictLevel: ConflictLevel;
  consensusStrength: number;
  directionVotes: DirectionVotes;
  summary: string;
  reasons: string[];
  components: MarketComponent[];
  availableComponentCount: number;
  strategyVersion: "market-intelligence-v2.1";
}
