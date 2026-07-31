export type MarketDirection = "bullish" | "neutral" | "bearish";
export type MarketSignal =
  | "strong_bullish"
  | "bullish"
  | "watch"
  | "caution"
  | "bearish"
  | "strong_bearish";
export type RiskLevel = "low" | "medium" | "high" | "extreme";
export type ConflictLevel = "low" | "medium" | "high";
export type ComponentName = "funding" | "etf" | "news";

export interface DirectionVotes {
  bullish: number;
  neutral: number;
  bearish: number;
}

export interface ComponentBreakdown {
  score: number;
  confidence: number;
  direction: MarketDirection;
  configured_weight: number;
  effective_weight: number;
  freshness_factor: number;
  contribution: number;
  age_hours: number;
  observed_at: string;
}

export type Breakdown = Partial<Record<ComponentName, ComponentBreakdown>>;

export interface MarketIntelligenceRow {
  id: number | string;
  symbol: string;
  calculated_at: string;
  market_score: number;
  raw_score: number | null;
  consensus_adjustment: number | null;
  confidence: number;
  direction: MarketDirection;
  signal: MarketSignal;
  risk_level: RiskLevel | null;
  conflict_level: ConflictLevel | null;
  consensus_strength: number | null;
  direction_votes: DirectionVotes | null;
  breakdown: Breakdown | null;
  summary: string | null;
  reasons: string[] | null;
  component_count: number | null;
  strategy_version: string | null;
}

export interface DashboardData {
  latest: MarketIntelligenceRow | null;
  history: MarketIntelligenceRow[];
  error: string | null;
}


// Paper Trading types
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type FinalMarketDecision = {
  id: number;
  symbol: string;
  decided_at: string;
  technical_score: number | null;
  technical_confidence: number | null;
  news_score: number | null;
  news_confidence: number | null;
  funding_score: number | null;
  funding_confidence: number | null;
  technical_weight: number | null;
  news_weight: number | null;
  funding_weight: number | null;
  final_score: number | null;
  final_confidence: number | null;
  direction: string | null;
  action: string | null;
  market_regime: string | null;
  risk_level: string | null;
  trading_permission: string | null;
  signal_alignment: string | null;
  conflict_score: number | null;
  decision_summary: string | null;
  decision_reasons: JsonValue;
  score_details: JsonValue;
  strategy_version: string | null;
};

export type FundingSnapshot = {
  id: number;
  symbol: string;
  funding_rate: number | null;
  funding_rate_percent: number | null;
  annualized_rate: number | null;
  annualized_rate_percent: number | null;
  mark_price: number | null;
  index_price: number | null;
  direction: string | null;
  risk_level: string | null;
  fetched_at: string | null;
  analyzed_at: string | null;
};

export type FinalMarketBacktest = {
  id: number;
  decision_id: number;
  symbol: string;
  status: string | null;
  return_5m: number | null;
  return_15m: number | null;
  return_30m: number | null;
  return_1h: number | null;
  return_4h: number | null;
  return_24h: number | null;
  best_return: number | null;
  worst_return: number | null;
  created_at: string;
  updated_at: string;
};

export type FinalMarketPerformance = {
  id: number;
  decision_id: number;
  symbol: string;
  direction_result: string | null;
  action_result: string | null;
  evaluation_status: string | null;
  market_return: number | null;
  directional_return: number | null;
  evaluated_at: string;
};


export type BacktestSummary = {
  total: number;
  completed: number;
  inProgress: number;
  failed: number;
  average24hReturn: number | null;
  bestReturn: number | null;
  worstReturn: number | null;
};

export type PerformanceSummary = {
  total: number;
  evaluated: number;
  directionCorrect: number;
  directionEvaluated: number;
  directionAccuracy: number | null;
  actionCorrect: number;
  actionEvaluated: number;
  actionAccuracy: number | null;
  averageDirectionalReturn: number | null;
  cumulativeDirectionalReturn: number | null;
  bestDirectionalReturn: number | null;
  worstDirectionalReturn: number | null;
};

export type PaperTradingAccount = {
  id: number;
  name: string;
  base_currency: string;
  initial_balance: number;
  cash_balance: number;
  realized_pnl: number;
  total_fees: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaperStrategyConfig = {
  id: number;
  account_id: number;
  symbol: string;
  strategy_version: string;
  long_score_min: number;
  short_score_max: number;
  confidence_min: number;
  position_size_percent: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  max_holding_minutes: number;
  fee_rate_percent: number;
  slippage_percent: number;
  allow_long: boolean;
  allow_short: boolean;
  is_active: boolean;
};

export type PaperPosition = {
  id: number;
  account_id: number;
  opening_decision_id: number | null;
  symbol: string;
  side: "long" | "short";
  status: "open" | "closed";
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  stop_loss_price: number;
  take_profit_price: number;
  entry_fee: number;
  exit_fee: number;
  realized_pnl: number | null;
  realized_return_percent: number | null;
  close_reason: string | null;
  opened_at: string;
  closed_at: string | null;
};

export type PaperOrder = {
  id: number;
  account_id: number;
  decision_id: number | null;
  symbol: string;
  side: "buy" | "sell";
  position_side: "long" | "short";
  requested_price: number;
  executed_price: number;
  quantity: number;
  notional: number;
  fee: number;
  status: string;
  created_at: string;
};

export type PaperTrade = {
  id: number;
  account_id: number;
  position_id: number;
  symbol: string;
  side: "long" | "short";
  entry_price: number;
  exit_price: number;
  quantity: number;
  gross_pnl: number;
  fees: number;
  net_pnl: number;
  return_percent: number;
  close_reason: string;
  opened_at: string;
  closed_at: string;
};

export type PaperStrategyRun = {
  id: number;
  account_id: number | null;
  symbol: string;
  decision_id: number | null;
  action_taken: string;
  reason: string;
  market_price: number | null;
  created_at: string;
};

export type PaperEquitySnapshot = {
  id: number;
  account_id: number;
  symbol: string;
  cash_balance: number;
  unrealized_pnl: number;
  equity: number;
  market_price: number;
  captured_at: string;
};

export type PaperTradingData = {
  account: PaperTradingAccount | null;
  config: PaperStrategyConfig | null;
  decisions: FinalMarketDecision[];
  funding: FundingSnapshot | null;
  backtestSummary: BacktestSummary;
  performanceSummary: PerformanceSummary;
  openPositions: PaperPosition[];
  orders: PaperOrder[];
  trades: PaperTrade[];
  runs: PaperStrategyRun[];
  equity: PaperEquitySnapshot[];
  decisionsById: Record<number, FinalMarketDecision>;
  marketPrice: number | null;
  error: string | null;
};

export type StrategyComparisonRow = {
  config_id: number;
  account_id: number;
  sort_order: number;
  strategy_name: string;
  strategy_kind: string | null;
  strategy_version: string;
  symbol: string;
  description: string | null;
  long_score_min: number;
  short_score_max: number;
  confidence_min: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  max_holding_minutes: number;
  initial_balance: number;
  cash_balance: number;
  realized_pnl: number;
  total_fees: number;
  equity: number;
  total_return_percent: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  net_pnl: number;
  avg_return_percent: number;
  avg_win_percent: number;
  avg_loss_percent: number;
  avg_holding_minutes: number;
  open_positions: number;
  profit_factor: number | null;
};

export type StrategyComparisonData = {
  rows: StrategyComparisonRow[];
  error: string | null;
};

export type CandidateComparisonRow = {
  id: number;
  comparison_run_id: string;
  candidate_key: string;
  candidate_name: string;
  candidate_kind: "conservative" | "balanced" | "aggressive";
  symbol: string;
  long_score_min: number;
  short_score_max: number;
  confidence_min: number;
  position_size_percent: number;
  source_observation_count: number;
  selected_trades: number;
  skipped_observations: number;
  selection_rate: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number | null;
  expected_return_percent: number | null;
  cumulative_return_percent: number;
  profit_factor: number | null;
  max_drawdown_percent: number;
  sample_status: "insufficient" | "provisional" | "ready";
  optimization_eligible: boolean;
  analyzed_at: string;
};

export type CandidateComparisonData = {
  rows: CandidateComparisonRow[];
  error: string | null;
};

export type StrategyValidationRow = {
  id: number;
  validation_run_id: string;
  candidate_key: string;
  candidate_name: string;
  candidate_kind: "conservative" | "balanced" | "aggressive";
  symbol: string;
  training_ratio: number;
  source_observation_count: number;
  split_at: string | null;
  training_observations: number;
  validation_observations: number;
  training_trades: number;
  validation_trades: number;
  training_expected_return: number | null;
  validation_expected_return: number | null;
  training_profit_factor: number | null;
  validation_profit_factor: number | null;
  training_max_drawdown: number;
  validation_max_drawdown: number;
  return_retention_ratio: number | null;
  profit_factor_retention_ratio: number | null;
  robustness_status: "insufficient" | "robust" | "watch" | "overfit";
  validation_eligible: boolean;
  validation_reason: string;
  analyzed_at: string;
};

export type StrategyValidationData = {
  rows: StrategyValidationRow[];
  error: string | null;
};

export type StrategyRecommendationRanking = {
  candidateKey: string;
  candidateName: string;
  candidateKind: string;
  rank: number | null;
  score: number;
  eligible: boolean;
  robustnessStatus: "insufficient" | "robust" | "watch" | "overfit";
  validationTrades: number;
  validationExpectedReturn: number | null;
  validationProfitFactor: number | null;
  validationMaxDrawdown: number;
  returnRetentionRatio: number | null;
  reason: string;
};

export type StrategyRecommendationRow = {
  id: number;
  source_validation_run_id: string;
  recommendation_status: "recommended" | "hold";
  selected_candidate_key: string | null;
  selected_candidate_name: string | null;
  selected_candidate_kind: string | null;
  recommendation_score: number | null;
  recommendation_confidence: number;
  recommendation_reason: string;
  eligible_candidate_count: number;
  selected_long_score_min: number | null;
  selected_short_score_max: number | null;
  selected_confidence_min: number | null;
  selected_position_size_percent: number | null;
  candidate_rankings: StrategyRecommendationRanking[];
  requires_manual_approval: boolean;
  applied_at: string | null;
  recommended_at: string;
};

export type StrategyRecommendationData = {
  recommendation: StrategyRecommendationRow | null;
  error: string | null;
};
