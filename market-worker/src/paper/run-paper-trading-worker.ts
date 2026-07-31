import { supabase } from "../lib/supabase";
import {
  calculateUnrealizedPnl,
  determineCloseReason,
  evaluateEntryEligibility,
  validateStrategyConfig,
} from "./PaperTradingRules";
import type {
  DecisionAction,
  DecisionDirection,
  PaperDecision,
  PaperPosition,
  PaperStrategyConfig,
  PositionSide,
  TradingPermission,
} from "./PaperTradingRules";

const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price";
const REQUEST_TIMEOUT_MS = 12_000;
const DECISION_MAX_AGE_MINUTES = 30;

interface PaperAccountRow {
  id: number;
  cash_balance: number | string;
}

interface StrategyConfigRow {
  id: number;
  account_id: number;
  symbol: string;
  long_score_min: number | string;
  short_score_max: number | string;
  confidence_min: number | string;
  max_holding_minutes: number;
  allow_long: boolean;
  allow_short: boolean;
}

interface FinalDecisionRow {
  id: number;
  symbol: string;
  decided_at: string;
  final_score: number | string;
  final_confidence: number | string;
  direction: DecisionDirection;
  action: DecisionAction;
  trading_permission: TradingPermission;
}

interface OpenPositionRow {
  id: number;
  account_id: number;
  symbol: string;
  side: PositionSide;
  quantity: number | string;
  entry_price: number | string;
  stop_loss_price: number | string;
  take_profit_price: number | string;
  opened_at: string;
}

interface RpcResult {
  status?: string;
  reason?: string;
  position_id?: number;
  side?: PositionSide;
  net_pnl?: number;
  return_percent?: number;
}

interface PaperWorkerOptions {
  logPrefix?: string;
}

type StrategyAction =
  | "opened_long"
  | "opened_short"
  | "closed"
  | "held"
  | "skipped"
  | "failed";

function toFiniteNumber(value: number | string, label: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }

  return parsed;
}

function round(value: number, digits = 8): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function mapConfig(row: StrategyConfigRow): PaperStrategyConfig {
  const config: PaperStrategyConfig = {
    symbol: row.symbol.trim().toUpperCase(),
    longScoreMin: toFiniteNumber(row.long_score_min, "LONG 기준 점수"),
    shortScoreMax: toFiniteNumber(row.short_score_max, "SHORT 기준 점수"),
    confidenceMin: toFiniteNumber(row.confidence_min, "최소 신뢰도"),
    maxHoldingMinutes: toFiniteNumber(
      row.max_holding_minutes,
      "최대 보유 시간",
    ),
    allowLong: row.allow_long,
    allowShort: row.allow_short,
  };

  validateStrategyConfig(config);
  return config;
}

function mapDecision(row: FinalDecisionRow | null): PaperDecision | null {
  if (!row) return null;

  return {
    decidedAt: row.decided_at,
    finalScore: toFiniteNumber(row.final_score, "최종 점수"),
    finalConfidence: toFiniteNumber(row.final_confidence, "최종 신뢰도"),
    direction: row.direction,
    action: row.action,
    tradingPermission: row.trading_permission,
  };
}

function mapPosition(row: OpenPositionRow): PaperPosition {
  return {
    side: row.side,
    quantity: toFiniteNumber(row.quantity, "포지션 수량"),
    entryPrice: toFiniteNumber(row.entry_price, "진입 가격"),
    stopLossPrice: toFiniteNumber(row.stop_loss_price, "손절 가격"),
    takeProfitPrice: toFiniteNumber(row.take_profit_price, "익절 가격"),
    openedAt: row.opened_at,
  };
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  const url = new URL(BINANCE_TICKER_URL);
  url.searchParams.set("symbol", symbol);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MarketMind-AI-Paper-Trading/2.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Binance HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as { price?: unknown };
    const price = Number(payload.price);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("Binance 현재가 응답이 올바르지 않습니다.");
    }

    return round(price);
  } finally {
    clearTimeout(timeout);
  }
}

async function getActiveConfigs(): Promise<StrategyConfigRow[]> {
  const { data, error } = await supabase
    .from("paper_strategy_configs")
    .select(`
      id,
      account_id,
      symbol,
      long_score_min,
      short_score_max,
      confidence_min,
      max_holding_minutes,
      allow_long,
      allow_short
    `)
    .eq("is_active", true)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`전략 설정 조회 실패: ${error.message}`);
  }

  return (data ?? []) as StrategyConfigRow[];
}

async function getAccount(accountId: number): Promise<PaperAccountRow> {
  const { data, error } = await supabase
    .from("paper_trading_accounts")
    .select("id, cash_balance")
    .eq("id", accountId)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    throw new Error(`활성 모의 계정 조회 실패: ${error?.message ?? "데이터 없음"}`);
  }

  return data as PaperAccountRow;
}

async function getLatestDecision(
  symbol: string,
): Promise<FinalDecisionRow | null> {
  const { data, error } = await supabase
    .from("final_market_decisions")
    .select(`
      id,
      symbol,
      decided_at,
      final_score,
      final_confidence,
      direction,
      action,
      trading_permission
    `)
    .eq("symbol", symbol)
    .order("decided_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`최신 Final Market AI 판단 조회 실패: ${error.message}`);
  }

  return (data as FinalDecisionRow | null) ?? null;
}

async function getOpenPosition(
  accountId: number,
  symbol: string,
): Promise<OpenPositionRow | null> {
  const { data, error } = await supabase
    .from("paper_positions")
    .select(`
      id,
      account_id,
      symbol,
      side,
      quantity,
      entry_price,
      stop_loss_price,
      take_profit_price,
      opened_at
    `)
    .eq("account_id", accountId)
    .eq("symbol", symbol)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`열린 포지션 조회 실패: ${error.message}`);
  }

  return (data as OpenPositionRow | null) ?? null;
}

async function insertStrategyRun(params: {
  accountId: number;
  symbol: string;
  decisionId: number | null;
  actionTaken: StrategyAction;
  reason: string;
  marketPrice: number | null;
}): Promise<void> {
  const { error } = await supabase.from("paper_strategy_runs").insert({
    account_id: params.accountId,
    symbol: params.symbol,
    decision_id: params.decisionId,
    action_taken: params.actionTaken,
    reason: params.reason.slice(0, 1000),
    market_price: params.marketPrice,
  });

  if (error) {
    throw new Error(`전략 실행 기록 저장 실패: ${error.message}`);
  }
}

async function insertEquitySnapshot(params: {
  account: PaperAccountRow;
  symbol: string;
  marketPrice: number;
  position: OpenPositionRow | null;
}): Promise<void> {
  const cashBalance = toFiniteNumber(params.account.cash_balance, "현금 잔액");
  let unrealizedPnl = 0;
  let reservedNotional = 0;

  if (params.position) {
    const position = mapPosition(params.position);
    unrealizedPnl = calculateUnrealizedPnl(position, params.marketPrice);
    reservedNotional = position.entryPrice * position.quantity;
  }

  const { error } = await supabase.from("paper_equity_snapshots").insert({
    account_id: params.account.id,
    symbol: params.symbol,
    cash_balance: round(cashBalance),
    unrealized_pnl: round(unrealizedPnl),
    equity: round(cashBalance + reservedNotional + unrealizedPnl),
    open_position_id: params.position?.id ?? null,
    market_price: params.marketPrice,
  });

  if (error) {
    throw new Error(`자산 스냅샷 저장 실패: ${error.message}`);
  }
}

async function processOpenPosition(params: {
  row: StrategyConfigRow;
  config: PaperStrategyConfig;
  decisionRow: FinalDecisionRow | null;
  positionRow: OpenPositionRow;
  marketPrice: number;
}): Promise<void> {
  const decision = mapDecision(params.decisionRow);
  const closeReason = determineCloseReason(
    mapPosition(params.positionRow),
    params.config,
    decision,
    params.marketPrice,
    DECISION_MAX_AGE_MINUTES,
  );

  if (!closeReason) {
    await insertStrategyRun({
      accountId: params.row.account_id,
      symbol: params.config.symbol,
      decisionId: params.decisionRow?.id ?? null,
      actionTaken: "held",
      reason: "익절·손절·최대 보유·유효한 반대 신호 조건이 없어 포지션을 유지했습니다.",
      marketPrice: params.marketPrice,
    });
    return;
  }

  const { data, error } = await supabase.rpc("paper_close_position_v1", {
    p_position_id: params.positionRow.id,
    p_market_price: params.marketPrice,
    p_close_reason: closeReason,
  });

  if (error) {
    throw new Error(`포지션 청산 실패: ${error.message}`);
  }

  const result = (data ?? {}) as RpcResult;
  const closed = result.status === "closed";
  const netPnl = Number(result.net_pnl ?? 0);

  await insertStrategyRun({
    accountId: params.row.account_id,
    symbol: params.config.symbol,
    decisionId: params.decisionRow?.id ?? null,
    actionTaken: closed ? "closed" : "skipped",
    reason: closed
      ? `${closeReason} 조건으로 포지션을 청산했습니다. 순손익 ${round(Number.isFinite(netPnl) ? netPnl : 0, 4)} USDT`
      : result.reason ?? "청산이 건너뛰어졌습니다.",
    marketPrice: params.marketPrice,
  });
}

async function processNewEntry(params: {
  row: StrategyConfigRow;
  config: PaperStrategyConfig;
  decisionRow: FinalDecisionRow | null;
  marketPrice: number;
}): Promise<void> {
  const eligibility = evaluateEntryEligibility(
    params.config,
    mapDecision(params.decisionRow),
    DECISION_MAX_AGE_MINUTES,
  );

  if (!eligibility.allowed || !params.decisionRow) {
    await insertStrategyRun({
      accountId: params.row.account_id,
      symbol: params.config.symbol,
      decisionId: params.decisionRow?.id ?? null,
      actionTaken: "skipped",
      reason: eligibility.reason,
      marketPrice: params.marketPrice,
    });
    return;
  }

  const { data, error } = await supabase.rpc("paper_open_position_v1", {
    p_account_id: params.row.account_id,
    p_config_id: params.row.id,
    p_decision_id: params.decisionRow.id,
    p_market_price: params.marketPrice,
  });

  if (error) {
    throw new Error(`포지션 진입 실패: ${error.message}`);
  }

  const result = (data ?? {}) as RpcResult;
  const opened = result.status === "opened";
  const side = result.side;

  await insertStrategyRun({
    accountId: params.row.account_id,
    symbol: params.config.symbol,
    decisionId: params.decisionRow.id,
    actionTaken:
      opened && side === "long"
        ? "opened_long"
        : opened && side === "short"
          ? "opened_short"
          : "skipped",
    reason: opened
      ? `${side === "long" ? "LONG" : "SHORT"} 모의 포지션을 열었습니다.`
      : result.reason ?? "진입이 건너뛰어졌습니다.",
    marketPrice: params.marketPrice,
  });
}

async function processConfig(
  row: StrategyConfigRow,
  marketPrice: number,
  decisionRow: FinalDecisionRow | null,
): Promise<void> {
  const config = mapConfig(row);
  const openPosition = await getOpenPosition(row.account_id, config.symbol);

  if (openPosition) {
    await processOpenPosition({
      row,
      config,
      decisionRow,
      positionRow: openPosition,
      marketPrice,
    });
  } else {
    await processNewEntry({
      row,
      config,
      decisionRow,
      marketPrice,
    });
  }

  const [accountAfter, positionAfter] = await Promise.all([
    getAccount(row.account_id),
    getOpenPosition(row.account_id, config.symbol),
  ]);

  await insertEquitySnapshot({
    account: accountAfter,
    symbol: config.symbol,
    marketPrice,
    position: positionAfter,
  });
}

export async function runPaperTradingWorker(
  options: PaperWorkerOptions = {},
): Promise<void> {
  const logPrefix = options.logPrefix ?? "Paper Trading";
  const configs = await getActiveConfigs();

  if (configs.length === 0) {
    console.log("활성 Paper Trading 전략이 없습니다.");
    return;
  }

  const marketPriceCache = new Map<string, Promise<number>>();
  const decisionCache = new Map<string, Promise<FinalDecisionRow | null>>();

  for (const row of configs) {
    const symbol = row.symbol.trim().toUpperCase();

    try {
      if (!marketPriceCache.has(symbol)) {
        marketPriceCache.set(symbol, fetchBinancePrice(symbol));
      }

      if (!decisionCache.has(symbol)) {
        decisionCache.set(symbol, getLatestDecision(symbol));
      }

      const [marketPrice, latestDecision] = await Promise.all([
        marketPriceCache.get(symbol) as Promise<number>,
        decisionCache.get(symbol) as Promise<FinalDecisionRow | null>,
      ]);

      console.log(`[${logPrefix}] config=${row.id} ${symbol} 전략 실행 시작`);
      await processConfig(row, marketPrice, latestDecision);
      console.log(`[${logPrefix}] config=${row.id} ${symbol} 전략 실행 완료`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(`[${logPrefix}] config=${row.id} ${symbol} 실행 실패:`, message);

      try {
        await insertStrategyRun({
          accountId: row.account_id,
          symbol,
          decisionId: null,
          actionTaken: "failed",
          reason: message,
          marketPrice: null,
        });
      } catch (loggingError) {
        console.error("Paper Trading 실패 기록 저장도 실패했습니다.", loggingError);
      }
    }
  }
}
