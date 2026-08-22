export interface BattleTrade {
  netPnl: number;
  returnPercent: number | null;
  feeAmount: number;
  holdingSeconds: number | null;
  closedAt: string;
  leverage?: number | null;
  leverageAdjusted?: boolean;
}
export interface StrategyBattleMetrics {
  totalTrades:number; winningTrades:number; losingTrades:number; breakevenTrades:number;
  winRate:number|null; netPnl:number; netReturnPercent:number; averagePnl:number|null;
  expectancyPercent:number|null; profitFactor:number|null; maxDrawdownPercent:number;
  totalFees:number; feeToGrossProfitPercent:number|null; averageHoldingMinutes:number|null;
  averageLeverage:number|null; leverageAdjustmentRate:number|null;
}
export interface BattleScore {
  total:number; returnScore:number; drawdownScore:number; profitFactorScore:number;
  expectancyScore:number; consistencyScore:number;
}
export interface FixedVsAdaptiveBattleResult {
  status:"warming_up"|"comparable";
  winner:"fixed"|"adaptive"|"tie"|"inconclusive";
  startedAt:string; analyzedAt:string;
  fixed:StrategyBattleMetrics; adaptive:StrategyBattleMetrics;
  fixedScore:BattleScore|null; adaptiveScore:BattleScore|null;
  minimumTradesRequired:number; reasons:string[];
}
