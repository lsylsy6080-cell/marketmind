export type CorrelationTimeframe = "15m" | "1h" | "4h";
export type CorrelationState = "synchronized" | "diverging" | "decoupled";
export type LeadLagLeader = "spot" | "futures" | "none";

export interface CorrelationCandle { openTime: string; close: number; }
export interface CorrelationTimeframeResult {
  timeframe: CorrelationTimeframe;
  pairCount: number;
  returnCorrelation: number;
  spotReturnPercent: number;
  futuresReturnPercent: number;
  returnGapPercent: number;
  basisPercent: number;
  leadLagLeader: LeadLagLeader;
  leadLagStrength: number;
  state: CorrelationState;
  divergenceScore: number;
}
export interface Phase82CorrelationResult {
  symbol: "BTCUSDT";
  calculatedAt: string;
  overallCorrelation: number;
  overallDivergenceScore: number;
  state: CorrelationState;
  riskLevel: "low" | "normal" | "high";
  timeframeDetails: CorrelationTimeframeResult[];
  reasons: string[];
  performance: { loadMs:number; analysisMs:number; saveMs:number; totalMs:number; rssMb:number; heapMb:number; };
  strategyVersion: "phase8-correlation-v8.2";
}
