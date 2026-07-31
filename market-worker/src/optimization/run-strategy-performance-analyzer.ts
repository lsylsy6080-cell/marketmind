import { supabase } from "../lib/supabase";
import {
  analyzeStrategyPerformance,
  type ClosedTradeSample,
  type StrategyPerformanceMetrics,
} from "./StrategyPerformanceAnalyzer";

const MAX_TRADES_PER_STRATEGY = 2_000;

interface StrategyConfigRow {
  id: number;
  account_id: number;
  symbol: string;
  strategy_version: string | null;
  long_score_min: number | string;
  short_score_max: number | string;
  confidence_min: number | string;
  position_size_percent: number | string;
  stop_loss_percent: number | string;
  take_profit_percent: number | string;
  max_holding_minutes: number;
}

interface TradeRow {
  id: number;
  net_pnl: number | string;
  return_percent: number | string;
  closed_at: string;
}

interface LatestSnapshotRow {
  total_trades: number;
  last_trade_id: number | null;
}

function toFiniteNumber(value: number | string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
  return parsed;
}

function mapTrade(row: TradeRow): ClosedTradeSample {
  return {
    id: Number(row.id),
    netPnl: toFiniteNumber(row.net_pnl, `trade_id=${row.id} net_pnl`),
    returnPercent: toFiniteNumber(
      row.return_percent,
      `trade_id=${row.id} return_percent`,
    ),
    closedAt: row.closed_at,
  };
}

async function getActiveConfigs(): Promise<StrategyConfigRow[]> {
  const { data, error } = await supabase
    .from("paper_strategy_configs")
    .select(`
      id,
      account_id,
      symbol,
      strategy_version,
      long_score_min,
      short_score_max,
      confidence_min,
      position_size_percent,
      stop_loss_percent,
      take_profit_percent,
      max_holding_minutes
    `)
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`활성 전략 설정 조회 실패: ${error.message}`);
  }

  return (data ?? []) as StrategyConfigRow[];
}

async function getClosedTrades(
  config: StrategyConfigRow,
): Promise<ClosedTradeSample[]> {
  const { data, error } = await supabase
    .from("paper_trades")
    .select("id, net_pnl, return_percent, closed_at")
    .eq("account_id", config.account_id)
    .eq("symbol", config.symbol)
    .not("closed_at", "is", null)
    .order("closed_at", { ascending: true })
    .limit(MAX_TRADES_PER_STRATEGY);

  if (error) {
    throw new Error(
      `config_id=${config.id} 청산 거래 조회 실패: ${error.message}`,
    );
  }

  return ((data ?? []) as TradeRow[]).map(mapTrade);
}

async function getLatestSnapshot(
  configId: number,
): Promise<LatestSnapshotRow | null> {
  const { data, error } = await supabase
    .from("strategy_performance_snapshots")
    .select("total_trades, last_trade_id")
    .eq("strategy_config_id", configId)
    .order("analyzed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`기존 전략 성과 조회 실패: ${error.message}`);
  }

  return (data as LatestSnapshotRow | null) ?? null;
}

function buildSnapshot(
  config: StrategyConfigRow,
  metrics: StrategyPerformanceMetrics,
): Record<string, unknown> {
  return {
    strategy_config_id: config.id,
    account_id: config.account_id,
    symbol: config.symbol.trim().toUpperCase(),
    strategy_version: config.strategy_version,
    long_score_min: toFiniteNumber(config.long_score_min, "LONG 기준 점수"),
    short_score_max: toFiniteNumber(config.short_score_max, "SHORT 기준 점수"),
    confidence_min: toFiniteNumber(config.confidence_min, "최소 신뢰도"),
    position_size_percent: toFiniteNumber(
      config.position_size_percent,
      "포지션 크기",
    ),
    stop_loss_percent: toFiniteNumber(config.stop_loss_percent, "손절 비율"),
    take_profit_percent: toFiniteNumber(
      config.take_profit_percent,
      "익절 비율",
    ),
    max_holding_minutes: config.max_holding_minutes,
    total_trades: metrics.totalTrades,
    winning_trades: metrics.winningTrades,
    losing_trades: metrics.losingTrades,
    breakeven_trades: metrics.breakevenTrades,
    win_rate: metrics.winRate,
    gross_profit: metrics.grossProfit,
    gross_loss: metrics.grossLoss,
    net_pnl: metrics.netPnl,
    average_pnl: metrics.averagePnl,
    average_return_percent: metrics.averageReturnPercent,
    average_win: metrics.averageWin,
    average_loss: metrics.averageLoss,
    payoff_ratio: metrics.payoffRatio,
    profit_factor: metrics.profitFactor,
    max_drawdown: metrics.maxDrawdown,
    max_drawdown_percent: metrics.maxDrawdownPercent,
    consecutive_wins_max: metrics.consecutiveWinsMax,
    consecutive_losses_max: metrics.consecutiveLossesMax,
    sample_status: metrics.sampleStatus,
    optimization_eligible: metrics.optimizationEligible,
    trades_until_provisional: metrics.tradesUntilProvisional,
    trades_until_ready: metrics.tradesUntilReady,
    first_trade_at: metrics.firstTradeAt,
    last_trade_at: metrics.lastTradeAt,
    last_trade_id: metrics.lastTradeId,
    analyzed_at: new Date().toISOString(),
  };
}

async function analyzeOneConfig(config: StrategyConfigRow): Promise<{
  saved: boolean;
  metrics: StrategyPerformanceMetrics;
}> {
  const trades = await getClosedTrades(config);
  const metrics = analyzeStrategyPerformance(trades);
  const latest = await getLatestSnapshot(config.id);

  if (
    latest &&
    Number(latest.total_trades) === metrics.totalTrades &&
    Number(latest.last_trade_id ?? 0) === Number(metrics.lastTradeId ?? 0)
  ) {
    return { saved: false, metrics };
  }

  const { error } = await supabase
    .from("strategy_performance_snapshots")
    .insert(buildSnapshot(config, metrics));

  if (error) {
    throw new Error(`config_id=${config.id} 전략 성과 저장 실패: ${error.message}`);
  }

  return { saved: true, metrics };
}

export async function runStrategyPerformanceAnalyzer(): Promise<void> {
  console.log("[Strategy Performance] Phase 5-1 분석 시작");
  const configs = await getActiveConfigs();

  if (configs.length === 0) {
    console.log("[Strategy Performance] 활성 전략이 없습니다.");
    return;
  }

  let saved = 0;
  let unchanged = 0;
  let failed = 0;

  for (const config of configs) {
    try {
      const result = await analyzeOneConfig(config);
      if (result.saved) saved += 1;
      else unchanged += 1;

      console.log(
        `[Strategy Performance] config=${config.id} trades=${result.metrics.totalTrades} ` +
          `status=${result.metrics.sampleStatus} winRate=${result.metrics.winRate ?? "N/A"} ` +
          `profitFactor=${result.metrics.profitFactor ?? "N/A"}`,
      );
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[Strategy Performance] config=${config.id} 분석 실패: ${message}`,
      );
    }
  }

  console.log("[Strategy Performance] Phase 5-1 분석 완료", {
    strategies: configs.length,
    saved,
    unchanged,
    failed,
  });
}
