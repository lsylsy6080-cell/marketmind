import { supabase } from "../lib/supabase";

type BinanceInterval = "5m" | "15m" | "1h" | "4h" | "1d";

type BinanceKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote asset volume
  number, // number of trades
  string, // taker buy base volume
  string, // taker buy quote volume
  string, // ignore
];

const INTERVALS: BinanceInterval[] = ["5m", "15m", "1h", "4h", "1d"];
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

async function fetchKlines(
  interval: BinanceInterval,
  limit: number,
): Promise<BinanceKline[]> {
  const url = new URL(BINANCE_KLINES_URL);
  url.searchParams.set("symbol", "BTCUSDT");
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "MarketMind-Worker/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `[multi-timeframe] Binance ${interval} HTTP ${response.status}: ${body.slice(0, 180)}`,
    );
  }

  return (await response.json()) as BinanceKline[];
}

async function saveInterval(
  interval: BinanceInterval,
  limit: number,
): Promise<number> {
  const klines = await fetchKlines(interval, limit);
  const now = Date.now();

  // 완전히 종료된 캔들만 저장합니다.
  const rows = klines
    .filter((kline) => Number(kline[6]) < now)
    .map((kline) => ({
      exchange: "binance",
      market_type: "spot",
      symbol: "BTCUSDT",
      timeframe: interval,
      open_time: toIso(Number(kline[0])),
      close_time: toIso(Number(kline[6])),
      open: kline[1],
      high: kline[2],
      low: kline[3],
      close: kline[4],
      volume: kline[5],
      quote_volume: kline[7],
      trade_count: Number(kline[8]),
      taker_buy_base_volume: kline[9],
      taker_buy_quote_volume: kline[10],
      is_closed: true,
    }));

  if (rows.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("market_candles")
    .upsert(rows, {
      onConflict: "exchange,market_type,symbol,timeframe,open_time",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(
      `[multi-timeframe] ${interval} 저장 실패: ${error.message}`,
    );
  }

  return rows.length;
}

/**
 * 차트 초기 로딩용 BTCUSDT 다중 시간봉을 Binance에서 직접 수집해
 * market_candles에 미리 저장합니다.
 *
 * Buddy4에서 실행되므로 Vercel의 Binance HTTP 451 제한과 무관합니다.
 */
export async function collectBtcChartTimeframes(
  limit = 500,
): Promise<Record<BinanceInterval, number>> {
  const result = {} as Record<BinanceInterval, number>;

  for (const interval of INTERVALS) {
    try {
      const count = await saveInterval(interval, limit);
      result[interval] = count;
      console.log(
        `[multi-timeframe] BTCUSDT ${interval}: ${count}개 저장 완료`,
      );
    } catch (error) {
      // 하나의 시간봉 실패가 전체 AI 워커를 중단시키지 않도록 분리합니다.
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[multi-timeframe] BTCUSDT ${interval} 수집 실패: ${message}`,
      );
      result[interval] = 0;
    }
  }

  return result;
}
