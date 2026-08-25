import type { DecisionV2Result, V2Action, V2Direction, V2TradingPermission } from "../decision-v2/types";
import type { ContextDirection, ContextPermission, Phase83MarketContextResult } from "../phase8-context/types";

export type GateAlignment = "aligned" | "neutral" | "conflict";
export type GatePermission = "pass" | "caution" | "blocked";

export interface Phase84DecisionGateInput {
  decision: Pick<DecisionV2Result,
    "symbol" | "calculatedAt" | "direction" | "action" | "entryQualityScore" |
    "tradingPermission" | "finalConfidence" | "riskLevel"
  >;
  context: Pick<Phase83MarketContextResult,
    "symbol" | "calculatedAt" | "preferredDirection" | "permission" |
    "confidence" | "contextScore" | "riskScore" | "structureState"
  >;
}

export interface Phase84DecisionGateResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  baseDirection: V2Direction;
  baseAction: V2Action;
  baseTradingPermission: V2TradingPermission;
  contextDirection: ContextDirection;
  contextPermission: ContextPermission;
  alignment: GateAlignment;
  gatePermission: GatePermission;
  shadowAction: V2Action;
  entryScoreDelta: number;
  shadowEntryQualityScore: number;
  confidence: number;
  reasons: string[];
  sourceCalculatedAt: { decision: string; context: string };
  strategyVersion: "phase8-context-decision-gate-v8.4";
  performance: { loadMs:number; analysisMs:number; saveMs:number; totalMs:number; rssMb:number; heapMb:number; };
}
