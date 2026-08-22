export type AdaptivePaperSide = "long" | "short";
export type AdaptivePaperCloseReason =
  | "stop_loss"
  | "take_profit"
  | "trigger_invalidated"
  | "opposite_direction"
  | "max_holding";

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
