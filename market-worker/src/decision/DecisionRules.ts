import type {
  FinalAction,
  RiskLevel,
  SignalAlignment,
  TradingPermission,
} from "./types";

function normalizePermission(value?: string): TradingPermission {
  if (value === "allowed" || value === "caution" || value === "blocked") {
    return value;
  }
  return "caution";
}

export interface PermissionInput {
  technicalPermission?: string;
  fundingPermission?: string;
  finalRisk: RiskLevel;
  finalConfidence: number;
  alignment: SignalAlignment;
}

export function determineTradingPermission(input: PermissionInput): TradingPermission {
  const technicalPermission = normalizePermission(input.technicalPermission);
  const fundingPermission = normalizePermission(input.fundingPermission);

  if (technicalPermission === "blocked" || input.finalRisk === "critical") {
    return "blocked";
  }

  if (
    technicalPermission === "caution" ||
    fundingPermission === "caution" ||
    fundingPermission === "blocked" ||
    input.finalRisk === "high" ||
    input.finalConfidence < 45 ||
    input.alignment === "conflict"
  ) {
    return "caution";
  }

  return "allowed";
}

export interface ActionInput {
  finalScore: number;
  finalConfidence: number;
  permission: TradingPermission;
  risk: RiskLevel;
}

export function determineFinalAction(input: ActionInput): FinalAction {
  if (input.permission === "blocked") return "wait";

  if (input.finalScore >= 75 && input.finalConfidence >= 70 && input.risk !== "high") {
    return "strong_buy";
  }
  if (input.finalScore >= 60 && input.finalConfidence >= 55) return "buy";
  if (input.finalScore <= 25 && input.finalConfidence >= 70) return "sell";
  if (input.finalScore <= 40 && input.finalConfidence >= 55) return "reduce";
  return "wait";
}
