export type GuardPermission = "allowed" | "reduced" | "blocked";
export type OutcomeLabel =
  | "good_entry"
  | "bad_entry"
  | "avoided_loss"
  | "missed_opportunity"
  | "protected"
  | "neutral";

export interface Phase87OutcomeInput {
  side: "long" | "short";
  permission: GuardPermission;
  marginMultiplier: number;
  referencePrice: number;
  futurePrice: number;
  horizonMinutes: number;
}

export interface Phase87OutcomeResult {
  side: "long" | "short";
  permission: GuardPermission;
  directionalReturnPercent: number;
  label: OutcomeLabel;
  qualityScore: number;
  horizonMinutes: number;
  strategyVersion: "phase8-context-outcome-v8.7";
}
