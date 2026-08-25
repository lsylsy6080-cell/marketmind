import { supabase } from "../lib/supabase";

type BinanceInterval = "5m" | "15m" | "1h" | "4h" | "1d";
type BinanceKline = [number,string,string,string,string,string,number,string,number,string,string,string];

const INTERVALS: BinanceInterval[] = ["5m", "15m", "1h", "4h", "1d"];
const KLINES_URL = "https://fapi.binance.com/fapi/v1/klines";

async function fetchKlines(interval: BinanceInterval, limit: number): Promise<BinanceKline[]> {
  const url = new URL(KLINES_URL);
  url.searchParams.set("symbol", "BTCUSDT");
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(Math.min(1500, Math.max(1, limit))));
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MarketMind-Worker/1.0" }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`[futures-timeframe] Binance ${interval} HTTP ${response.status}: ${(await response.text().catch(()=>" ")).slice(0,180)}`);
  return (await response.json()) as BinanceKline[];
}

async function saveInterval(interval: BinanceInterval, limit: number): Promise<number> {
  const now = Date.now();
  const rows = (await fetchKlines(interval, limit)).filter(k=>Number(k[6]) < now).map(k=>({
    exchange:"binance", market_type:"futures", symbol:"BTCUSDT", timeframe:interval,
    open_time:new Date(Number(k[0])).toISOString(), close_time:new Date(Number(k[6])).toISOString(),
    open:k[1], high:k[2], low:k[3], close:k[4], volume:k[5], quote_volume:k[7], trade_count:Number(k[8]),
    taker_buy_base_volume:k[9], taker_buy_quote_volume:k[10], is_closed:true,
  }));
  if (!rows.length) return 0;
  const { error } = await supabase.from("market_candles").upsert(rows,{onConflict:"exchange,market_type,symbol,timeframe,open_time",ignoreDuplicates:false});
  if (error) throw new Error(`[futures-timeframe] ${interval} 저장 실패: ${error.message}`);
  return rows.length;
}

export async function collectBtcFuturesTimeframes(limit=10): Promise<Record<BinanceInterval,number>> {
  const result={} as Record<BinanceInterval,number>;
  for (const interval of INTERVALS) {
    try { result[interval]=await saveInterval(interval,limit); }
    catch(error) { result[interval]=0; console.error(`[futures-timeframe] ${interval} 실패: ${error instanceof Error?error.message:String(error)}`); }
  }
  return result;
}
