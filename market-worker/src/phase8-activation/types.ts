import type { V2Action, V2TradingPermission } from "../decision-v2/types";
import type { GateAlignment, GatePermission } from "../phase8-decision-gate/types";

export type ActivationMode = "shadow" | "guarded";
export type ActivationPermission = "allowed" | "caution" | "blocked";

export interface Phase85ActivationInput {
  baseAction: V2Action;
  baseTradingPermission: V2TradingPermission;
  gatePermission: GatePermission;
  alignment: GateAlignment;
  shadowAction: V2Action;
  shadowEntryQualityScore: number;
  gateConfidence: number;
  contextRiskScore: number;
  mode?: ActivationMode;
}

export interface Phase85ActivationResult {
  mode: ActivationMode;
  baseAction: V2Action;
  effectiveAction: V2Action;
  effectiveTradingPermission: ActivationPermission;
  effectiveEntryQualityScore: number;
  applied: boolean;
  blockedByContext: boolean;
  reasons: string[];
  strategyVersion: "phase8-context-activation-v8.5";
}
