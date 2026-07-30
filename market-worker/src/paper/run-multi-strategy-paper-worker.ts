import { supabase } from "../lib/supabase";

const BINANCE_TICKER_URL = "https://api.binance.com/api/v3/ticker/price";
const REQUEST_TIMEOUT_MS = 12_000;
const DECISION_MAX_AGE_MINUTES = 30;

type PositionSide = "long" | "short";
type CloseReason =
  | "take_profit"
  | "stop_loss"
  | "max_holding"
  | "opposite_signal";

type DecisionDirection = "bullish" | "neutral" | "bearish";
type DecisionAction = "strong_buy" | "buy" | "wait" | "reduce" | "sell";
type TradingPermission = "allowed" | "caution" | "blocked";

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

function elapsedMinutes(timestamp: string): number {
  const time = new Date(timestamp).getTime();

  if (!Number.isFinite(time)) {
    throw new Error(`시간 값이 올바르지 않습니다: ${timestamp}`);
  }

  return Math.max(0, (Date.now() - time) / 60_000);
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  const url = new URL(BINANCE_TICKER_URL);
  url.searchParams.set("symbol", symbol);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MarketMind-AI-Paper-Trading/1.0",
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

async function getLatestDecision(symbol: string): Promise<FinalDecisionRow | null> {
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
    .maybeSingle();

  if (error) {
    throw new Error(`열린 포지션 조회 실패: ${error.message}`);
  }

  return (data as OpenPositionRow | null) ?? null;
}

function determineCloseReason(
  position: OpenPositionRow,
  config: StrategyConfigRow,
  decision: FinalDecisionRow | null,
  marketPrice: number,
): CloseReason | null {
  const stopLossPrice = toFiniteNumber(position.stop_loss_price, "손절 가격");
  const takeProfitPrice = toFiniteNumber(position.take_profit_price, "익절 가격");

  if (position.side === "long") {
    if (marketPrice <= stopLossPrice) return "stop_loss";
    if (marketPrice >= takeProfitPrice) return "take_profit";
  } else {
    if (marketPrice >= stopLossPrice) return "stop_loss";
    if (marketPrice <= takeProfitPrice) return "take_profit";
  }

  if (elapsedMinutes(position.opened_at) >= config.max_holding_minutes) {
    return "max_holding";
  }

  if (!decision || decision.trading_permission === "blocked") {
    return null;
  }

  const score = toFiniteNumber(decision.final_score, "최종 점수");
  const confidence = toFiniteNumber(decision.final_confidence, "최종 신뢰도");
  const confidenceMin = toFiniteNumber(config.confidence_min, "최소 신뢰도");

  if (confidence < confidenceMin) {
    return null;
  }

  if (
    position.side === "long" &&
    decision.direction === "bearish" &&
    decision.action === "sell" &&
    score <= toFiniteNumber(config.short_score_max, "SHORT 기준 점수")
  ) {
    return "opposite_signal";
  }

  if (
    position.side === "short" &&
    decision.direction === "bullish" &&
    (decision.action === "strong_buy" || decision.action === "buy") &&
    score >= toFiniteNumber(config.long_score_min, "LONG 기준 점수")
  ) {
    return "opposite_signal";
  }

  return null;
}

function calculateUnrealizedPnl(
  position: OpenPositionRow,
  marketPrice: number,
): number {
  const entryPrice = toFiniteNumber(position.entry_price, "진입 가격");
  const quantity = toFiniteNumber(position.quantity, "포지션 수량");

  return position.side === "long"
    ? (marketPrice - entryPrice) * quantity
    : (entryPrice - marketPrice) * quantity;
}

async function insertStrategyRun(params: {
  accountId: number;
  symbol: string;
  decisionId: number | null;
  actionTaken: "opened_long" | "opened_short" | "closed" | "held" | "skipped" | "failed";
  reason: string;
  marketPrice: number | null;
}): Promise<void> {
  const { error } = await supabase.from("paper_strategy_runs").insert({
    account_id: params.accountId,
    symbol: params.symbol,
    decision_id: params.decisionId,
    action_taken: params.actionTaken,
    reason: params.reason,
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
    unrealizedPnl = calculateUnrealizedPnl(params.position, params.marketPrice);
    reservedNotional =
      toFiniteNumber(params.position.entry_price, "진입 가격") *
      toFiniteNumber(params.position.quantity, "수량");
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

async function processConfig(config: StrategyConfigRow): Promise<void> {
  const [marketPrice, latestDecision, openPosition] = await Promise.all([
    fetchBinancePrice(config.symbol),
    getLatestDecision(config.symbol),
    getOpenPosition(config.account_id, config.symbol),
  ]);

  const decisionId = latestDecision?.id ?? null;

  if (openPosition) {
    const closeReason = determineCloseReason(
      openPosition,
      config,
      latestDecision,
      marketPrice,
    );

    if (closeReason) {
      const { data, error } = await supabase.rpc("paper_close_position_v1", {
        p_position_id: openPosition.id,
        p_market_price: marketPrice,
        p_close_reason: closeReason,
      });

      if (error) {
        throw new Error(`포지션 청산 실패: ${error.message}`);
      }

      const result = (data ?? {}) as RpcResult;
      const reason =
        result.status === "closed"
          ? `${closeReason} 조건으로 포지션을 청산했습니다. 순손익 ${round(Number(result.net_pnl ?? 0), 4)} USDT`
          : result.reason ?? "청산이 건너뛰어졌습니다.";

      await insertStrategyRun({
        accountId: config.account_id,
        symbol: config.symbol,
        decisionId,
        actionTaken: result.status === "closed" ? "closed" : "skipped",
        reason,
        marketPrice,
      });
    } else {
      await insertStrategyRun({
        accountId: config.account_id,
        symbol: config.symbol,
        decisionId,
        actionTaken: "held",
        reason: "익절·손절·최대 보유·반대 신호 조건이 없어 포지션을 유지했습니다.",
        marketPrice,
      });
    }
  } else if (!latestDecision) {
    await insertStrategyRun({
      accountId: config.account_id,
      symbol: config.symbol,
      decisionId: null,
      actionTaken: "skipped",
      reason: "Final Market AI 판단 데이터가 없습니다.",
      marketPrice,
    });
  } else if (elapsedMinutes(latestDecision.decided_at) > DECISION_MAX_AGE_MINUTES) {
    await insertStrategyRun({
      accountId: config.account_id,
      symbol: config.symbol,
      decisionId,
      actionTaken: "skipped",
      reason: `최신 판단이 ${DECISION_MAX_AGE_MINUTES}분보다 오래되어 진입하지 않았습니다.`,
      marketPrice,
    });
  } else {
    const { data, error } = await supabase.rpc("paper_open_position_v1", {
      p_account_id: config.account_id,
      p_config_id: config.id,
      p_decision_id: latestDecision.id,
      p_market_price: marketPrice,
    });

    if (error) {
      throw new Error(`포지션 진입 실패: ${error.message}`);
    }

    const result = (data ?? {}) as RpcResult;
    const opened = result.status === "opened";
    const side = result.side;

    await insertStrategyRun({
      accountId: config.account_id,
      symbol: config.symbol,
      decisionId,
      actionTaken:
        opened && side === "long"
          ? "opened_long"
          : opened && side === "short"
            ? "opened_short"
            : "skipped",
      reason: opened
        ? `${side === "long" ? "LONG" : "SHORT"} 모의 포지션을 열었습니다.`
        : result.reason ?? "진입이 건너뛰어졌습니다.",
      marketPrice,
    });
  }

  const [accountAfter, positionAfter] = await Promise.all([
    getAccount(config.account_id),
    getOpenPosition(config.account_id, config.symbol),
  ]);

  await insertEquitySnapshot({
    account: accountAfter,
    symbol: config.symbol,
    marketPrice,
    position: positionAfter,
  });
}

export async function runMultiStrategyPaperWorker(): Promise<void> {
  const configs = await getActiveConfigs();

  if (configs.length === 0) {
    console.log("활성 Paper Trading 전략이 없습니다.");
    return;
  }

  for (const config of configs) {
    try {
      console.log(`[다중 전략 모의매매] ${config.symbol} 전략 실행을 시작합니다.`);
      await processConfig(config);
      console.log(`[다중 전략 모의매매] ${config.symbol} 전략 실행이 완료되었습니다.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      console.error(`[다중 전략 모의매매] ${config.symbol} 실행 실패:`, message);

      try {
        await insertStrategyRun({
          accountId: config.account_id,
          symbol: config.symbol,
          decisionId: null,
          actionTaken: "failed",
          reason: message.slice(0, 1000),
          marketPrice: null,
        });
      } catch (loggingError) {
        console.error("Paper Trading 실패 기록 저장도 실패했습니다.", loggingError);
      }
    }
  }
}


// 기존 index.ts와의 호환용 별칭
export const runPaperTradingWorker = runMultiStrategyPaperWorker;
