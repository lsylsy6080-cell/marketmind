import type { MarketRegimeResult } from "../regime/types";

export type V2Direction = "bullish" | "neutral" | "bearish";
export type V2Action = "strong_buy" | "buy" | "wait" | "reduce" | "sell";
export type V2RiskLevel = "low" | "normal" | "high" | "critical";
export type EntryQuality = "excellent" | "good" | "fair" | "poor";
export type PreferredEntry = "pullback" | "breakout" | "mean_reversion" | "trend_continuation" | "wait";
export type V2TradingPermission = "allowed" | "caution" | "blocked";

export interface DecisionV2Component {
  score: number;
  confidence: number;
  direction?: V2Direction;
  observedAt: string;
  riskLevel?: string;
  tradingPermission?: string;
  conflictScore?: number;
  details?: Record<string, unknown> | null;
  limitedNewsCandidate?: { status: string; bullishThreshold: number | null; bearishThreshold: number | null; mode: "bullish_only" };
  fundingCrowdingCandidate?: {
    status: string;
    sampleCount: number;
    p10BasisPoints: number | null;
    medianBasisPoints: number | null;
    p90BasisPoints: number | null;
    p90AbsoluteBasisPoints: number | null;
    sourceAgeHours: number;
  };
}


export interface EntryMarketStructure {
  swingLow15m: number | null;
  swingHigh15m: number | null;
  swingLow1h: number | null;
  swingHigh1h: number | null;
  observedAt: string | null;
}

export interface OpenInterestDecisionContext {
  id: number;
  observedAt: string;
  flowState: "long_building" | "short_building" | "short_covering" | "long_unwinding" | "neutral" | "insufficient_data";
  directionalBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  oiChange5mPercent: number | null;
  oiChange15mPercent: number | null;
  oiChange1hPercent: number | null;
  priceChange5mPercent: number | null;
  priceChange15mPercent: number | null;
  priceChange1hPercent: number | null;
  entryAdjustment: number;
  overheatAdjustment: number;
  reversalAdjustment: number;
  reasons: string[];
}

export interface EntryTriggerValidation {
  status: "WATCH" | "RE_EVALUATE" | "READY" | "INVALIDATED" | "UNAVAILABLE";
  zone: "before_first" | "first_zone" | "second_zone" | "invalidated" | "unavailable";
  referencePlanSource: "previous" | "current";
  referencePlanCalculatedAt: string | null;
  referencePlan: EntryTimingPlan | null;
  currentPrice: number | null;
  conditions: {
    priceZoneReached: boolean;
    entryScorePass: boolean;
    overheatPass: boolean;
    fifteenMinutePass: boolean;
    oneHourTrendPass: boolean;
    regimePass: boolean;
    newsSafe: boolean;
    fundingSafe: boolean;
    reliabilityPass: boolean;
    permissionPass: boolean;
  };
  passedConditions: number;
  totalConditions: number;
  readyThreshold: number;
  blockers: string[];
  reasons: string[];
}

export interface DecisionV2Input {
  technical: DecisionV2Component;
  news: DecisionV2Component;
  funding: DecisionV2Component;
  regime: MarketRegimeResult;
  previousEntryPlan?: EntryTimingPlan | null;
  previousEntryPlanCalculatedAt?: string | null;
  marketStructure?: EntryMarketStructure | null;
  openInterest?: OpenInterestDecisionContext | null;
  now?: Date;
}

export interface DecisionV2Weights {
  technical: number;
  news: number;
  funding: number;
  regime: number;
  reason: string;
}


export interface EntryTimingPlan {
  status: "active" | "wait" | "unavailable";
  side: "long" | "short" | "none";
  currentPrice: number | null;
  firstInterestPrice: number | null;
  secondInterestPrice: number | null;
  invalidationPrice: number | null;
  currentEntryScore: number;
  firstInterestEstimatedScore: number | null;
  secondInterestEstimatedScore: number | null;
  firstDistancePercent: number | null;
  secondDistancePercent: number | null;
  invalidationDistancePercent: number | null;
  basis: string[];
}

export interface DecisionV2Result {
  symbol: "BTCUSDT";
  calculatedAt: string;
  directionScore: number;
  marketTrendStrength: number;
  directionStrength: number;
  finalScore: number;
  finalConfidence: number;
  direction: V2Direction;
  action: V2Action;
  entryQualityScore: number;
  entryQuality: EntryQuality;
  overheatRisk: number;
  reversalRisk: number;
  dataReliability: number;
  riskLevel: V2RiskLevel;
  tradingPermission: V2TradingPermission;
  preferredEntry: PreferredEntry;
  entryPlan: EntryTimingPlan;
  entryTrigger: EntryTriggerValidation;
  fundingCrowdingRisk: number;
  fundingCrowdingSide: "long_crowded" | "balanced" | "short_crowded" | "unavailable";
  fundingEntryPenalty: number;
  fundingCrowdingStatus: "active" | "inactive" | "distribution_saturated" | "insufficient_data" | "stale";
  openInterestFlowState: OpenInterestDecisionContext["flowState"];
  openInterestDirectionalBias: OpenInterestDecisionContext["directionalBias"];
  openInterestConfidence: number;
  openInterestEntryAdjustment: number;
  openInterestOverheatAdjustment: number;
  openInterestReversalAdjustment: number;
  weights: DecisionV2Weights;
  reasons: string[];
  invalidationConditions: string[];
  componentContributions: Record<string, number>;
  strategyVersion: string;
}
