import { supabase } from "../lib/supabase";

const BINANCE_KLINE_URL =
  "https://data-api.binance.vision/api/v3/klines";

type BinanceKline = [
  number, // open time
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote volume
  number, // trade count
  string, // taker buy base volume
  string, // taker buy quote volume
  string, // ignore
];

interface MarketCandleRow {
  exchange: string;
  market_type: string;
  symbol: string;
  timeframe: string;
  open_time: string;
  close_time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume: number;
  trade_count: number;
  taker_buy_base_volume: number;
  taker_buy_quote_volume: number;
  is_closed: boolean;
}

function mapKlineToRow(kline: BinanceKline): MarketCandleRow {
  return {
    exchange: "binance",
    market_type: "spot",
    symbol: "BTCUSDT",
    timeframe: "1m",
    open_time: new Date(kline[0]).toISOString(),
    close_time: new Date(kline[6]).toISOString(),
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
    quote_volume: Number(kline[7]),
    trade_count: kline[8],
    taker_buy_base_volume: Number(kline[9]),
    taker_buy_quote_volume: Number(kline[10]),
    is_closed: true,
  };
}

async function fetchBinanceKlines(
  limit: number,
): Promise<BinanceKline[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 1000);

  const params = new URLSearchParams({
    symbol: "BTCUSDT",
    interval: "1m",
    limit: String(safeLimit),
  });

  const response = await fetch(
    `${BINANCE_KLINE_URL}?${params.toString()}`,
  );

  if (!response.ok) {
    const responseText = await response.text();

    throw new Error(
      `Binance API 요청 실패: ${response.status} ${responseText}`,
    );
  }

  const data = (await response.json()) as unknown;

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Binance에서 캔들 데이터를 받지 못했습니다.");
  }

  return data as BinanceKline[];
}

async function saveCandles(
  rows: MarketCandleRow[],
): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("market_candles")
    .upsert(rows, {
      onConflict:
        "exchange,market_type,symbol,timeframe,open_time",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new Error(`Supabase 저장 실패: ${error.message}`);
  }

  return rows.length;
}

export async function collectBinanceBtcCandles(
  limit = 10,
): Promise<number> {
  const klines = await fetchBinanceKlines(limit);

  const now = Date.now();

  const completedKlines = klines.filter(
    (kline) => kline[6] < now,
  );

  const rows = completedKlines.map(mapKlineToRow);

  if (rows.length === 0) {
    console.log("저장할 완료 캔들이 없습니다.");
    return 0;
  }

  return saveCandles(rows);
}