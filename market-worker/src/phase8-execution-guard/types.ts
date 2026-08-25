export type ExecutionSide = "long" | "short";
export type ExecutionGuardPermission = "allowed" | "reduced" | "blocked";

export interface Phase86ExecutionGuardInput {
  side: ExecutionSide;
  activationAction: "strong_buy" | "buy" | "wait" | "reduce" | "sell";
  activationPermission: "allowed" | "caution" | "blocked";
  activationEntryQualityScore: number;
  activationApplied: boolean;
  blockedByContext: boolean;
  activationAgeMinutes: number;
}

export interface Phase86ExecutionGuardResult {
  permission: ExecutionGuardPermission;
  marginMultiplier: number;
  sideAllowed: boolean;
  reasons: string[];
  strategyVersion: "phase8-execution-guard-v8.6";
}
