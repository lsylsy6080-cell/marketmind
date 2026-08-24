export type AdaptivePaperSide = "long" | "short";
export type AdaptivePaperCloseReason =
  | "stop_loss"
  | "take_profit"
  | "trigger_invalidated"
  | "opposite_direction"
  | "max_holding"
  | "squeeze_active";

export interface LiquidationSafetyResult {
  requestedLeverage: number;
  appliedLeverage: number;
  adjusted: boolean;
  estimatedLiquidationPrice: number;
  liquidationDistancePercent: number;
  stopDistancePercent: number;
  safetyBufferPercent: number;
  minimumRequiredDistancePercent: number;
  maintenanceMarginRatePercent: number;
  status: "safe" | "adjusted" | "blocked";
  reasons: string[];
}

export interface AdaptiveExecutionPlan {
  side: AdaptivePaperSide;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  marginPercent: number;
  requestedLeverage: number;
  leverage: number;
  leverageAdjusted: boolean;
  marginAmount: number;
  notionalAmount: number;
  quantity: number;
  stopDistancePercent: number;
  targetDistancePercent: number;
  riskRewardRatio: number;
  entryFee: number;
  expectedStopLossAmount: number;
  estimatedLiquidationPrice: number;
  liquidationDistancePercent: number;
  liquidationSafetyBufferPercent: number;
  liquidationSafetyStatus: "safe" | "adjusted";
  maintenanceMarginRatePercent: number;
  liquidationSafetyReasons: string[];
}

export interface AdaptivePaperSummary {
  action: "opened_long" | "opened_short" | "held" | "closed" | "skipped";
  reason: string;
  positionId?: number;
  tradeId?: number;
  plan?: AdaptiveExecutionPlan;
}


export type AdaptiveSqueezePhase = "WATCH" | "BUILDING" | "IMMINENT" | "ACTIVE" | "EXHAUSTION";

export interface AdaptiveSqueezeWarning {
  snapshotId: number | null;
  observedAt: string | null;
  longPhase: AdaptiveSqueezePhase;
  shortPhase: AdaptiveSqueezePhase;
  longAlertScore: number;
  shortAlertScore: number;
}

export interface AdaptiveSqueezeProtection {
  action: "hold" | "tighten_stop" | "close";
  relevantPhase: AdaptiveSqueezePhase;
  relevantAlertScore: number;
  newStopLossPrice: number | null;
  reason: string;
}

export interface AdaptiveSqueezeEntryGuard {
  allowed: boolean;
  marginMultiplier: number;
  adversePhase: AdaptiveSqueezePhase;
  favorablePhase: AdaptiveSqueezePhase;
  reason: string;
}
