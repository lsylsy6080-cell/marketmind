#!/usr/bin/env node
/**
 * One-shot Buddy4 test collector. No PM2 changes, no Supabase credentials.
 * Requires an already-created market_candles table and local psql access.
 * Run: node scripts/test-buddy4-candle-ingest.mjs
 */
import { spawnSync } from "node:child_process";

const database = process.env.PGDATABASE || "marketmind";
const endpoint = "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=5";
const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
if (!response.ok) throw new Error("Binance HTTP " + response.status);
const klines = await response.json();
if (!Array.isArray(klines)) throw new Error("Unexpected Binance response");
const now = Date.now();
const completed = klines.filter(row => Array.isArray(row) && Number(row[6]) < now);
if (!completed.length) throw new Error("No completed candles");
const numeric = x => {
  const s = String(x);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) throw new Error("Invalid numeric candle value");
  return s;
};
const rows = completed.map(row => {
  const opened = Number(row[0]), closed = Number(row[6]);
  if (!Number.isSafeInteger(opened) || !Number.isSafeInteger(closed)) throw new Error("Invalid timestamp");
  return "('binance','spot','BTCUSDT','1m',to_timestamp(" + (opened / 1000) +
    "),to_timestamp(" + (closed / 1000) + ")," +
    [row[1],row[2],row[3],row[4],row[5],row[7],row[8],row[9],row[10]].map(numeric).join(",") + ",true)";
});
const sql = "BEGIN;\nINSERT INTO public.market_candles " +
  "(exchange,market_type,symbol,timeframe,open_time,close_time,open,high,low,close,volume,quote_volume,trade_count,taker_buy_base_volume,taker_buy_quote_volume,is_closed) VALUES\n" +
  rows.join(",\n") +
  "\nON CONFLICT(exchange,market_type,symbol,timeframe,open_time) DO UPDATE SET " +
  "close_time=excluded.close_time,open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close," +
  "volume=excluded.volume,quote_volume=excluded.quote_volume,trade_count=excluded.trade_count," +
  "taker_buy_base_volume=excluded.taker_buy_base_volume,taker_buy_quote_volume=excluded.taker_buy_quote_volume,is_closed=excluded.is_closed;\n" +
  "SELECT COUNT(*) AS stored_completed_1m_candles FROM public.market_candles WHERE exchange='binance' AND market_type='spot' AND symbol='BTCUSDT' AND timeframe='1m' AND is_closed=true;\nCOMMIT;\n";
const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-d", database, "-f", "-"], {
  input: sql, encoding: "utf8", timeout: 15000
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("psql failed: " + (result.stderr || result.stdout));
console.log(result.stdout);
console.log("One-shot imported completed candles:", completed.length);
