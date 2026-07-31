export type Direction = "bullish" | "neutral" | "bearish";

export type FinalAction =
  | "strong_buy"
  | "buy"
  | "wait"
  | "reduce"
  | "sell";

export type RiskLevel = "low" | "normal" | "high" | "critical";

export type TradingPermission = "allowed" | "caution" | "blocked";

export type SignalAlignment =
  | "strong_alignment"
  | "alignment"
  | "mixed"
  | "conflict";

export interface DecisionWeights {
  technical: number;
  news: number;
  funding: number;
  /**
   * ETF 데이터가 없거나 아직 연동되지 않은 실행과의 호환성을 위해 선택값으로 둡니다.
   * ETF 연동 시에는 0~1 범위의 정규화된 가중치를 사용합니다.
   */
  etf?: number;
  reason: string;
}

export interface DecisionSignal {
  score: number;
  confidence: number;
  direction?: Direction;
  riskLevel?: RiskLevel | string;
  tradingPermission?: TradingPermission | string;
}

export interface TechnicalDecisionSignal extends DecisionSignal {
  marketRegime?: string;
}

export interface NewsDecisionSignal extends DecisionSignal {
  conflictScore: number;
  marketPressure?: string;
  articleCount?: number;
  dominantCategory?: string | null;
}

export interface FundingDecisionSignal extends DecisionSignal {
  fundingRate?: number;
  fundingRatePercent: number;
  annualizedRatePercent?: number;
}

export interface EtfDecisionSignal extends DecisionSignal {
  /** ETF 순유입·순유출 금액. 데이터 원본 단위를 그대로 유지합니다. */
  netFlow?: number;
  /** ETF 데이터 기준 시각 또는 날짜. */
  observedAt?: string;
  /** 데이터 최신성을 0~1로 정규화한 값. */
  freshness?: number;
  /** ETF 데이터 출처 또는 집계 공급자. */
  source?: string;
}

export interface DecisionEngineInput {
  technical: TechnicalDecisionSignal;
  news: NewsDecisionSignal;
  funding: FundingDecisionSignal;
  /** ETF 데이터가 없을 때도 기존 Decision Engine이 동작하도록 선택값으로 둡니다. */
  etf?: EtfDecisionSignal;
}

export interface DecisionReason {
  type:
    | "technical"
    | "news"
    | "funding"
    | "etf"
    | "permission"
    | "weighting";
  [key: string]: unknown;
}

export interface DecisionEngineResult {
  finalScore: number;
  finalConfidence: number;
  direction: Direction;
  action: FinalAction;
  riskLevel: RiskLevel;
  tradingPermission: TradingPermission;
  alignment: SignalAlignment;
  weights: DecisionWeights;
  summary: string;
  reasons: DecisionReason[];
}
