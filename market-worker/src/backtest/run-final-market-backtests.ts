import { supabase } from "../lib/supabase";

const SYMBOL = "BTCUSDT";
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const DECISION_BATCH_SIZE = 100;
const BACKTEST_BATCH_SIZE = 100;
const MAX_RETRY_COUNT = 10;
const REQUEST_TIMEOUT_MS = 12_000;

type BacktestStatus =
  | "pending"
  | "5m_complete"
  | "15m_complete"
  | "30m_complete"
  | "1h_complete"
  | "4h_complete"
  | "completed"
  | "failed";

type PriceColumn =
  | "price_5m"
  | "price_15m"
  | "price_30m"
  | "price_1h"
  | "price_4h"
  | "price_24h";

type ReturnColumn =
  | "return_5m"
  | "return_15m"
  | "return_30m"
  | "return_1h"
  | "return_4h"
  | "return_24h";

type ObservedAtColumn =
  | "observed_at_5m"
  | "observed_at_15m"
  | "observed_at_30m"
  | "observed_at_1h"
  | "observed_at_4h"
  | "observed_at_24h";

interface FinalDecisionRow {
  id: number;
  symbol: string;
  decided_at: string;
}

interface BacktestRow {
  id: number;
  decision_id: number;
  symbol: string;
  entry_time: string;
  entry_price: number | string;
  price_5m: number | string | null;
  price_15m: number | string | null;
  price_30m: number | string | null;
  price_1h: number | string | null;
  price_4h: number | string | null;
  price_24h: number | string | null;
  return_5m: number | string | null;
  return_15m: number | string | null;
  return_30m: number | string | null;
  return_1h: number | string | null;
  return_4h: number | string | null;
  return_24h: number | string | null;
  retry_count: number;
}

interface HorizonDefinition {
  minutes: number;
  priceColumn: PriceColumn;
  returnColumn: ReturnColumn;
  observedAtColumn: ObservedAtColumn;
}

const HORIZONS: readonly HorizonDefinition[] = [
  {
    minutes: 5,
    priceColumn: "price_5m",
    returnColumn: "return_5m",
    observedAtColumn: "observed_at_5m",
  },
  {
    minutes: 15,
    priceColumn: "price_15m",
    returnColumn: "return_15m",
    observedAtColumn: "observed_at_15m",
  },
  {
    minutes: 30,
    priceColumn: "price_30m",
    returnColumn: "return_30m",
    observedAtColumn: "observed_at_30m",
  },
  {
    minutes: 60,
    priceColumn: "price_1h",
    returnColumn: "return_1h",
    observedAtColumn: "observed_at_1h",
  },
  {
    minutes: 240,
    priceColumn: "price_4h",
    returnColumn: "return_4h",
    observedAtColumn: "observed_at_4h",
  },
  {
    minutes: 1440,
    priceColumn: "price_24h",
    returnColumn: "return_24h",
    observedAtColumn: "observed_at_24h",
  },
] as const;

function toFiniteNumber(
  value: number | string | null,
  label: string,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }

  return parsed;
}

function round(value: number, digits: number): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function calculateReturnPercent(
  entryPrice: number,
  observedPrice: number,
): number {
  return round(
    ((observedPrice - entryPrice) / entryPrice) * 100,
    6,
  );
}

function floorToMinute(timestampMs: number): number {
  return Math.floor(timestampMs / 60_000) * 60_000;
}

async function fetchBinanceMinuteOpenPrice(
  symbol: string,
  targetTimeMs: number,
): Promise<{
  price: number;
  observedAt: string;
}> {
  const startTime = floorToMinute(targetTimeMs);
  const url = new URL(BINANCE_KLINES_URL);

  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1m");
  url.searchParams.set("startTime", String(startTime));
  url.searchParams.set("limit", "1");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MarketMind-AI-Backtest/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();

      throw new Error(
        `Binance HTTP ${response.status}: ${body.slice(0, 300)}`,
      );
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error(
        `${symbol} ${new Date(startTime).toISOString()} 시점의 1분봉이 없습니다.`,
      );
    }

    const candle = payload[0];

    if (!Array.isArray(candle) || candle.length < 5) {
      throw new Error("Binance 1분봉 응답 형식이 올바르지 않습니다.");
    }

    const openTime = Number(candle[0]);
    const openPrice = Number(candle[1]);

    if (
      !Number.isFinite(openTime) ||
      !Number.isFinite(openPrice) ||
      openPrice <= 0
    ) {
      throw new Error("Binance 1분봉 가격 값이 올바르지 않습니다.");
    }

    return {
      price: round(openPrice, 8),
      observedAt: new Date(openTime).toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createMissingBacktests(): Promise<number> {
  const { data: decisionsRaw, error: decisionsError } =
    await supabase
      .from("final_market_decisions")
      .select("id, symbol, decided_at")
      .order("decided_at", {
        ascending: false,
      })
      .limit(DECISION_BATCH_SIZE);

  if (decisionsError) {
    throw new Error(
      `Final Decision 조회 실패: ${decisionsError.message}`,
    );
  }

  const decisions =
    (decisionsRaw ?? []) as FinalDecisionRow[];

  if (decisions.length === 0) {
    return 0;
  }

  const decisionIds = decisions.map(
    (decision) => decision.id,
  );

  const { data: existingRaw, error: existingError } =
    await supabase
      .from("final_market_backtests")
      .select("decision_id")
      .in("decision_id", decisionIds);

  if (existingError) {
    throw new Error(
      `기존 Backtest 조회 실패: ${existingError.message}`,
    );
  }

  const existingIds = new Set(
    (existingRaw ?? []).map(
      (row: { decision_id: number }) =>
        Number(row.decision_id),
    ),
  );

  const missingDecisions = decisions.filter(
    (decision) => !existingIds.has(decision.id),
  );

  let createdCount = 0;

  for (const decision of missingDecisions) {
    try {
      const entryTimeMs = new Date(
        decision.decided_at,
      ).getTime();

      if (!Number.isFinite(entryTimeMs)) {
        throw new Error(
          `decided_at 값이 올바르지 않습니다: ${decision.decided_at}`,
        );
      }

      const entry = await fetchBinanceMinuteOpenPrice(
        decision.symbol || SYMBOL,
        entryTimeMs,
      );

      const { error: insertError } = await supabase
        .from("final_market_backtests")
        .upsert(
          {
            decision_id: decision.id,
            symbol: decision.symbol || SYMBOL,
            entry_time: decision.decided_at,
            entry_price: entry.price,
            status: "pending",
            last_error: null,
            retry_count: 0,
          },
          {
            onConflict: "decision_id",
            ignoreDuplicates: true,
          },
        );

      if (insertError) {
        throw new Error(insertError.message);
      }

      createdCount += 1;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[Backtest] decision_id=${decision.id} 생성 실패: ${message}`,
      );
    }
  }

  return createdCount;
}

function getStatusFromPrices(
  values: Partial<Record<PriceColumn, number | string | null>>,
): BacktestStatus {
  if (values.price_24h != null) {
    return "completed";
  }

  if (values.price_4h != null) {
    return "4h_complete";
  }

  if (values.price_1h != null) {
    return "1h_complete";
  }

  if (values.price_30m != null) {
    return "30m_complete";
  }

  if (values.price_15m != null) {
    return "15m_complete";
  }

  if (values.price_5m != null) {
    return "5m_complete";
  }

  return "pending";
}

function collectReturns(
  row: BacktestRow,
  updates: Record<string, unknown>,
): number[] {
  const returns: number[] = [];

  for (const horizon of HORIZONS) {
    const candidate =
      updates[horizon.returnColumn] ??
      row[horizon.returnColumn];

    if (candidate == null) {
      continue;
    }

    const numeric = Number(candidate);

    if (Number.isFinite(numeric)) {
      returns.push(numeric);
    }
  }

  return returns;
}

async function updateOneBacktest(
  row: BacktestRow,
  nowMs: number,
): Promise<boolean> {
  const entryTimeMs = new Date(row.entry_time).getTime();

  if (!Number.isFinite(entryTimeMs)) {
    throw new Error(
      `entry_time 값이 올바르지 않습니다: ${row.entry_time}`,
    );
  }

  const entryPrice = toFiniteNumber(
    row.entry_price,
    "entry_price",
  );

  const updates: Record<string, unknown> = {};
  let changed = false;

  for (const horizon of HORIZONS) {
    if (row[horizon.priceColumn] != null) {
      continue;
    }

    const targetTimeMs =
      entryTimeMs + horizon.minutes * 60_000;

    if (nowMs < targetTimeMs) {
      continue;
    }

    const observed = await fetchBinanceMinuteOpenPrice(
      row.symbol,
      targetTimeMs,
    );

    updates[horizon.priceColumn] = observed.price;
    updates[horizon.returnColumn] =
      calculateReturnPercent(
        entryPrice,
        observed.price,
      );
    updates[horizon.observedAtColumn] =
      observed.observedAt;

    changed = true;
  }

  if (!changed) {
    return false;
  }

  const mergedPrices: Partial<
    Record<PriceColumn, number | string | null>
  > = {};

  for (const horizon of HORIZONS) {
    mergedPrices[horizon.priceColumn] =
      (updates[horizon.priceColumn] ??
        row[horizon.priceColumn]) as
        | number
        | string
        | null;
  }

  const returns = collectReturns(row, updates);

  updates.best_return =
    returns.length > 0
      ? round(Math.max(...returns), 6)
      : null;
  updates.worst_return =
    returns.length > 0
      ? round(Math.min(...returns), 6)
      : null;
  updates.status = getStatusFromPrices(
    mergedPrices,
  );
  updates.last_error = null;
  updates.retry_count = 0;

  const { error: updateError } = await supabase
    .from("final_market_backtests")
    .update(updates)
    .eq("id", row.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return true;
}

async function recordBacktestError(
  row: BacktestRow,
  error: unknown,
): Promise<void> {
  const message =
    error instanceof Error
      ? error.message
      : String(error);

  const nextRetryCount =
    Number(row.retry_count || 0) + 1;

  const nextStatus: BacktestStatus =
    nextRetryCount >= MAX_RETRY_COUNT
      ? "failed"
      : getStatusFromPrices(row);

  const { error: updateError } = await supabase
    .from("final_market_backtests")
    .update({
      last_error: message.slice(0, 2000),
      retry_count: nextRetryCount,
      status: nextStatus,
    })
    .eq("id", row.id);

  if (updateError) {
    console.error(
      `[Backtest] 오류 상태 저장 실패 id=${row.id}: ${updateError.message}`,
    );
  }

  console.error(
    `[Backtest] id=${row.id}, decision_id=${row.decision_id} 처리 실패 (${nextRetryCount}/${MAX_RETRY_COUNT}): ${message}`,
  );
}

async function updateDueBacktests(): Promise<{
  checked: number;
  updated: number;
  failed: number;
}> {
  const dueBefore = new Date(
    Date.now() - 5 * 60_000,
  ).toISOString();

  const { data: rowsRaw, error: rowsError } =
    await supabase
      .from("final_market_backtests")
      .select(
        `
        id,
        decision_id,
        symbol,
        entry_time,
        entry_price,
        price_5m,
        price_15m,
        price_30m,
        price_1h,
        price_4h,
        price_24h,
        return_5m,
        return_15m,
        return_30m,
        return_1h,
        return_4h,
        return_24h,
        retry_count
        `,
      )
      .neq("status", "completed")
      .lt("retry_count", MAX_RETRY_COUNT)
      .lte("entry_time", dueBefore)
      .order("entry_time", {
        ascending: true,
      })
      .limit(BACKTEST_BATCH_SIZE);

  if (rowsError) {
    throw new Error(
      `처리 대상 Backtest 조회 실패: ${rowsError.message}`,
    );
  }

  const rows =
    (rowsRaw ?? []) as unknown as BacktestRow[];

  let updated = 0;
  let failed = 0;
  const nowMs = Date.now();

  for (const row of rows) {
    try {
      const didUpdate = await updateOneBacktest(
        row,
        nowMs,
      );

      if (didUpdate) {
        updated += 1;
      }
    } catch (error: unknown) {
      failed += 1;
      await recordBacktestError(row, error);
    }
  }

  return {
    checked: rows.length,
    updated,
    failed,
  };
}

export async function runFinalMarketBacktests(): Promise<void> {
  console.log("[Backtest] V1 실행 시작");

  const created = await createMissingBacktests();
  const result = await updateDueBacktests();

  console.log("[Backtest] V1 실행 완료", {
    created,
    checked: result.checked,
    updated: result.updated,
    failed: result.failed,
  });
}
