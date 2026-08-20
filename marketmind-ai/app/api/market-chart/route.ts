import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
const MAX_LIMIT = 1500;

type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

export async function GET(request: NextRequest) {
  const interval = request.nextUrl.searchParams.get("interval") ?? "1m";
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? "500");
  const endTime = Number(request.nextUrl.searchParams.get("endTime") ?? "");

  if (!ALLOWED_INTERVALS.has(interval) || symbol !== "BTCUSDT") {
    return NextResponse.json({ ok: false, error: "지원하지 않는 심볼 또는 시간봉입니다." }, { status: 400 });
  }

  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(requestedLimit)))
    : 500;

  try {
    const url = new URL("https://fapi.binance.com/fapi/v1/klines");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("limit", String(limit));
    if (Number.isFinite(endTime) && endTime > 0) {
      url.searchParams.set("endTime", String(Math.floor(endTime)));
    }

    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Binance HTTP ${response.status}`);

    const source = (await response.json()) as BinanceKline[];
    const candles = source.map((row) => ({
      time: Math.floor(row[0] / 1000),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
    }));

    return NextResponse.json(
      {
        ok: true,
        symbol,
        interval,
        candles,
        hasMore: candles.length === limit,
        fetchedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "차트 데이터를 불러오지 못했습니다." },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
