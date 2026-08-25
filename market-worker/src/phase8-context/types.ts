import type { Phase81Result, SRLevel } from "../phase8-market-structure/types";
import type { Phase82CorrelationResult } from "../phase8-correlation/types";

export type ContextDirection = "long" | "short" | "neutral";
export type ContextPermission = "favorable" | "caution" | "avoid";
export type StructureState = "long_room" | "short_room" | "balanced" | "compressed";

export interface Phase83ContextInput {
  structure: Pick<Phase81Result, "symbol" | "calculatedAt" | "currentPrice" | "nearestSupport" | "nearestResistance">;
  correlation: Pick<Phase82CorrelationResult, "symbol" | "calculatedAt" | "overallCorrelation" | "overallDivergenceScore" | "state" | "riskLevel">;
}

export interface Phase83MarketContextResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  preferredDirection: ContextDirection;
  permission: ContextPermission;
  confidence: number;
  contextScore: number;
  riskScore: number;
  structureState: StructureState;
  upsideRoomPercent: number | null;
  downsideRoomPercent: number | null;
  supportStrength: number | null;
  resistanceStrength: number | null;
  correlationState: Phase82CorrelationResult["state"];
  correlationRiskLevel: Phase82CorrelationResult["riskLevel"];
  reasons: string[];
  sourceCalculatedAt: { structure: string; correlation: string };
  strategyVersion: "phase8-market-context-v8.3";
  performance: { loadMs:number; analysisMs:number; saveMs:number; totalMs:number; rssMb:number; heapMb:number; };
}

export interface ContextLevelView {
  support: SRLevel | null;
  resistance: SRLevel | null;
}
