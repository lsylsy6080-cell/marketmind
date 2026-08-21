import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

type MarketCandleRow = {
  open_time: string;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string | null;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function toNumber(value: number | string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCandle(row: MarketCandleRow): Candle {
  return {
    time: Math.floor(new Date(row.open_time).getTime() / 1000),
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume),
  };
}

export async function GET(request: NextRequest) {
  const interval = request.nextUrl.searchParams.get("interval") ?? "1m";
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
  const rawEndTime = Number(request.nextUrl.searchParams.get("endTime") ?? "");

  if (!ALLOWED_INTERVALS.has(interval) || symbol !== "BTCUSDT") {
    return NextResponse.json(
      { ok: false, error: "지원하지 않는 심볼 또는 시간봉입니다." },
      { status: 400 },
    );
  }

  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  try {
    const supabase = createAdminClient();

    // Worker가 1m/5m/15m/1h/4h/1d를 market_candles에 미리 저장하므로
    // Vercel에서는 1분봉 재집계를 하지 않고 필요한 timeframe만 바로 읽습니다.
    let query = supabase
      .from("market_candles")
      .select("open_time,open,high,low,close,volume")
      .eq("exchange", "binance")
      .eq("market_type", "spot")
      .eq("symbol", symbol)
      .eq("timeframe", interval)
      .eq("is_closed", true)
      .order("open_time", { ascending: false })
      .limit(limit + 1);

    if (Number.isFinite(rawEndTime) && rawEndTime > 0) {
      query = query.lt("open_time", new Date(rawEndTime).toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as MarketCandleRow[];
    const hasMore = rows.length > limit;
    const selected = rows.slice(0, limit);

    const candles = selected
      .map(toCandle)
      .filter(
        (candle) =>
          Number.isFinite(candle.time) &&
          candle.time > 0 &&
          candle.open > 0 &&
          candle.high > 0 &&
          candle.low > 0 &&
          candle.close > 0,
      )
      .reverse();

    if (candles.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Supabase market_candles에 ${symbol} ${interval} 데이터가 없습니다. Worker의 다중 시간봉 수집 상태를 확인해주세요.`,
        },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        symbol,
        interval,
        candles,
        hasMore,
        source: `supabase:${interval}:direct`,
        fetchedAt: new Date().toISOString(),
      },
      {
        // 실시간 현재 캔들은 브라우저 Binance WebSocket이 갱신하므로
        // 완료 캔들 API는 짧게 캐시해 초기 로딩 속도를 개선합니다.
        headers: {
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (error) {
    console.error("[market-chart] direct timeframe query failed", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `Supabase 차트 조회 실패: ${error.message}`
            : "Supabase 차트 데이터를 불러오지 못했습니다.",
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
