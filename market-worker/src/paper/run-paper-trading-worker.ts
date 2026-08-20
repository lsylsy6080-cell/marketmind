import { supabase } from "../lib/supabase";
import {
  calculatePositionReturnPercent,
  calculateUnrealizedPnl,
  deriveProtectionThresholds,
  determineCloseReason,
  elapsedMinutes,
  evaluateEntryEligibility,
  updatePositionExcursion,
  validateStrategyConfig,
} from "./PaperTradingRules";
import type {
  DecisionAction,
  DecisionDirection,
  PaperDecision,
  PaperPosition,
  PaperStrategyConfig,
  PositionExcursion,
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
  entry_final_score: number | string | null;
  entry_confidence: number | string | null;
  entry_direction: DecisionDirection | null;
  entry_action: DecisionAction | null;
  entry_trading_permission: TradingPermission | null;
  decision_snapshot: Record<string, unknown> | null;
  mfe_percent: number | string | null;
  mae_percent: number | string | null;
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

function mapExcursion(row: OpenPositionRow): PositionExcursion {
  return {
    mfePercent: row.mfe_percent == null ? 0 : toFiniteNumber(row.mfe_percent, "MFE"),
    maePercent: row.mae_percent == null ? 0 : toFiniteNumber(row.mae_percent, "MAE"),
  };
}

async function trackPositionExcursion(params: {
  positionRow: OpenPositionRow;
  marketPrice: number;
}): Promise<PositionExcursion> {
  const position = mapPosition(params.positionRow);
  const currentReturnPercent = calculatePositionReturnPercent(
    position,
    params.marketPrice,
  );
  const next = updatePositionExcursion(
    mapExcursion(params.positionRow),
    currentReturnPercent,
  );

  const changed =
    next.mfePercent !== mapExcursion(params.positionRow).mfePercent ||
    next.maePercent !== mapExcursion(params.positionRow).maePercent;

  if (changed) {
    const { error } = await supabase
      .from("paper_positions")
      .update({
        mfe_percent: round(next.mfePercent, 6),
        mae_percent: round(next.maePercent, 6),
      })
      .eq("id", params.positionRow.id);

    if (error) {
      throw new Error(`MFE/MAE 갱신 실패: ${error.message}`);
    }
  }

  return next;
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
      opened_at,
      entry_final_score,
      entry_confidence,
      entry_direction,
      entry_action,
      entry_trading_permission,
      decision_snapshot,
      mfe_percent,
      mae_percent
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

function buildDecisionSnapshot(
  row: FinalDecisionRow,
): Record<string, unknown> {
  return {
    decisionId: row.id,
    symbol: row.symbol,
    decidedAt: row.decided_at,
    finalScore: toFiniteNumber(row.final_score, "최종 점수"),
    finalConfidence: toFiniteNumber(row.final_confidence, "최종 신뢰도"),
    direction: row.direction,
    action: row.action,
    tradingPermission: row.trading_permission,
  };
}

async function attachEntryDecisionMetadata(params: {
  positionId: number;
  decision: FinalDecisionRow;
}): Promise<void> {
  const snapshot = buildDecisionSnapshot(params.decision);

  const { error } = await supabase
    .from("paper_positions")
    .update({
      entry_final_score: snapshot.finalScore,
      entry_confidence: snapshot.finalConfidence,
      entry_direction: params.decision.direction,
      entry_action: params.decision.action,
      entry_trading_permission: params.decision.trading_permission,
      decision_snapshot: snapshot,
    })
    .eq("id", params.positionId);

  if (error) {
    throw new Error(`v3-1 진입 판단 스냅샷 저장 실패: ${error.message}`);
  }
}

async function attachTradeAuditMetadata(params: {
  position: OpenPositionRow;
  closeDecision: FinalDecisionRow | null;
}): Promise<void> {
  const openedAt = new Date(params.position.opened_at).getTime();
  const holdingSeconds = Number.isFinite(openedAt)
    ? Math.max(0, Math.round((Date.now() - openedAt) / 1000))
    : null;

  const closeSnapshot = params.closeDecision
    ? buildDecisionSnapshot(params.closeDecision)
    : null;

  const { error } = await supabase
    .from("paper_trades")
    .update({
      entry_final_score:
        params.position.entry_final_score == null
          ? null
          : Number(params.position.entry_final_score),
      entry_confidence:
        params.position.entry_confidence == null
          ? null
          : Number(params.position.entry_confidence),
      entry_direction: params.position.entry_direction,
      entry_action: params.position.entry_action,
      entry_trading_permission: params.position.entry_trading_permission,
      entry_decision_snapshot: params.position.decision_snapshot,
      close_decision_id: params.closeDecision?.id ?? null,
      close_final_score: params.closeDecision
        ? toFiniteNumber(params.closeDecision.final_score, "청산 판단 점수")
        : null,
      close_confidence: params.closeDecision
        ? toFiniteNumber(params.closeDecision.final_confidence, "청산 판단 신뢰도")
        : null,
      close_direction: params.closeDecision?.direction ?? null,
      close_action: params.closeDecision?.action ?? null,
      close_trading_permission:
        params.closeDecision?.trading_permission ?? null,
      close_decision_snapshot: closeSnapshot,
      holding_seconds: holdingSeconds,
      mfe_percent:
        params.position.mfe_percent == null ? 0 : Number(params.position.mfe_percent),
      mae_percent:
        params.position.mae_percent == null ? 0 : Number(params.position.mae_percent),
    })
    .eq("position_id", params.position.id);

  if (error) {
    throw new Error(`v3-1 거래 감사정보 저장 실패: ${error.message}`);
  }
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

function formatSignedPercent(value: number): string {
  const rounded = round(value, 3);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

function buildCloseDiagnostic(params: {
  position: PaperPosition;
  config: PaperStrategyConfig;
  decision: PaperDecision | null;
  marketPrice: number;
  excursion: PositionExcursion;
  nowMs?: number;
}): string {
  const nowMs = params.nowMs ?? Date.now();
  const holdingMinutes = elapsedMinutes(params.position.openedAt, nowMs);
  const holdingProgress = Math.min(
    999,
    (holdingMinutes / params.config.maxHoldingMinutes) * 100,
  );

  const priceReturn =
    params.position.side === "long"
      ? ((params.marketPrice / params.position.entryPrice) - 1) * 100
      : ((params.position.entryPrice / params.marketPrice) - 1) * 100;

  const stopDistance =
    Math.abs(params.marketPrice - params.position.stopLossPrice) /
    params.marketPrice *
    100;
  const takeProfitDistance =
    Math.abs(params.position.takeProfitPrice - params.marketPrice) /
    params.marketPrice *
    100;
  const protection = deriveProtectionThresholds(params.position);
  const trailFloor = params.excursion.mfePercent - protection.trailingGivebackPercent;

  let decisionState = "판단 없음";
  if (params.decision) {
    const age = elapsedMinutes(params.decision.decidedAt, nowMs);
    const freshness = age <= DECISION_MAX_AGE_MINUTES ? "유효" : "만료";
    decisionState =
      `${params.decision.direction}/${params.decision.action}` +
      ` score=${round(params.decision.finalScore, 2)}` +
      ` conf=${round(params.decision.finalConfidence, 2)}` +
      ` age=${round(age, 1)}m(${freshness})` +
      ` permission=${params.decision.tradingPermission}`;
  }

  return (
    `보유 ${round(holdingMinutes, 1)}/${params.config.maxHoldingMinutes}분` +
    `(${round(holdingProgress, 1)}%), ` +
    `진입대비 ${formatSignedPercent(priceReturn)}, ` +
    `SL까지 ${round(stopDistance, 3)}%, ` +
    `TP까지 ${round(takeProfitDistance, 3)}%, ` +
    `MFE ${formatSignedPercent(params.excursion.mfePercent)}, ` +
    `MAE ${formatSignedPercent(params.excursion.maePercent)}, ` +
    `BE≥${round(protection.breakEvenActivationPercent, 3)}%, ` +
    `Trail≥${round(protection.trailingActivationPercent, 3)}%/floor ${formatSignedPercent(trailFloor)}, ` +
    `판단 ${decisionState}`
  );
}

async function processOpenPosition(params: {
  row: StrategyConfigRow;
  config: PaperStrategyConfig;
  decisionRow: FinalDecisionRow | null;
  positionRow: OpenPositionRow;
  marketPrice: number;
}): Promise<void> {
  const decision = mapDecision(params.decisionRow);
  const excursion = await trackPositionExcursion({
    positionRow: params.positionRow,
    marketPrice: params.marketPrice,
  });
  params.positionRow.mfe_percent = excursion.mfePercent;
  params.positionRow.mae_percent = excursion.maePercent;

  const closeReason = determineCloseReason(
    mapPosition(params.positionRow),
    params.config,
    decision,
    params.marketPrice,
    DECISION_MAX_AGE_MINUTES,
    Date.now(),
    excursion,
  );

  const closeDiagnostic = buildCloseDiagnostic({
    position: mapPosition(params.positionRow),
    config: params.config,
    decision,
    marketPrice: params.marketPrice,
    excursion,
  });

  if (!closeReason) {
    await insertStrategyRun({
      accountId: params.row.account_id,
      symbol: params.config.symbol,
      decisionId: params.decisionRow?.id ?? null,
      actionTaken: "held",
      reason: `청산 조건 미충족 · ${closeDiagnostic}`,
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

  if (closed) {
    await attachTradeAuditMetadata({
      position: params.positionRow,
      closeDecision: params.decisionRow,
    });
  }

  await insertStrategyRun({
    accountId: params.row.account_id,
    symbol: params.config.symbol,
    decisionId: params.decisionRow?.id ?? null,
    actionTaken: closed ? "closed" : "skipped",
    reason: closed
      ? `${closeReason} 조건으로 포지션을 청산했습니다. 순손익 ${round(Number.isFinite(netPnl) ? netPnl : 0, 4)} USDT · ${closeDiagnostic}`
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

  if (opened && result.position_id) {
    await attachEntryDecisionMetadata({
      positionId: result.position_id,
      decision: params.decisionRow,
    });
  }

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
