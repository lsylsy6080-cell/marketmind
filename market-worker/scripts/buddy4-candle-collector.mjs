#!/usr/bin/env node
// Independent Buddy4 candle collector. Does not modify PM2 or Supabase configuration.
// Usage: node scripts/buddy4-candle-collector.mjs --once [--intervals=1m,5m]
// Optional continuous mode (manual foreground): --loop --every-seconds=60
import { spawnSync } from "node:child_process";
const args=process.argv.slice(2);
const loop=args.includes("--loop");
if (!loop && !args.includes("--once")) throw new Error("Specify --once or --loop explicitly");
const allowed=new Set(["1m","5m","15m","1h","4h","1d","1w"]);
const requested=args.find(x=>x.startsWith("--intervals="))?.slice(12)??"1m,5m,15m,1h,4h,1d,1w";
const intervals=[...new Set(requested.split(",").map(x=>x.trim()))];
if (!intervals.length || intervals.some(x=>!allowed.has(x))) throw new Error("Unsupported interval");
const every=Number(args.find(x=>x.startsWith("--every-seconds="))?.slice(16)??60);
if (!Number.isInteger(every)||every<60) throw new Error("Loop interval must be at least 60 seconds");
const db=process.env.PGDATABASE||"marketmind";
const maxRows=Number(process.env.BUDDY4_CANDLE_LIMIT||"5");
if (!Number.isInteger(maxRows)||maxRows<2||maxRows>1000) throw new Error("BUDDY4_CANDLE_LIMIT must be 2..1000");
const decimal=x=>{const s=String(x);if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s))throw new Error("Invalid Binance number");return s};
const runSql=sql=>{
 const result=spawnSync("psql",["-X","-q","-v","ON_ERROR_STOP=1","-d",db,"-f","-"],{input:sql,encoding:"utf8",timeout:30000});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error((result.stderr||result.stdout).trim());
};
async function collect(interval){
 const url=new URL("https://data-api.binance.vision/api/v3/klines");
 url.searchParams.set("symbol","BTCUSDT");url.searchParams.set("interval",interval);url.searchParams.set("limit",String(maxRows));
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error("Binance HTTP "+response.status);
 const data=await response.json();
 if(!Array.isArray(data))throw new Error("Unexpected Binance response");
 const complete=data.filter(x=>Array.isArray(x)&&Number(x[6])<Date.now());
 if(!complete.length)return 0;
 const values=complete.map(x=>{
   const openMs=Number(x[0]),closeMs=Number(x[6]);
   if(!Number.isSafeInteger(openMs)||!Number.isSafeInteger(closeMs))throw new Error("Invalid timestamp");
   const numbers=[x[1],x[2],x[3],x[4],x[5],x[7],x[8],x[9],x[10]].map(decimal);
   return "('binance','spot','BTCUSDT','"+interval+"',to_timestamp("+(openMs/1000)+"),to_timestamp("+(closeMs/1000)+"),"+numbers.join(",")+",true)";
 });
 const sql="BEGIN; INSERT INTO public.market_candles (exchange,market_type,symbol,timeframe,open_time,close_time,open,high,low,close,volume,quote_volume,trade_count,taker_buy_base_volume,taker_buy_quote_volume,is_closed) VALUES "+values.join(",")+" ON CONFLICT(exchange,market_type,symbol,timeframe,open_time) DO UPDATE SET close_time=excluded.close_time,open=excluded.open,high=excluded.high,low=excluded.low,close=excluded.close,volume=excluded.volume,quote_volume=excluded.quote_volume,trade_count=excluded.trade_count,taker_buy_base_volume=excluded.taker_buy_base_volume,taker_buy_quote_volume=excluded.taker_buy_quote_volume,is_closed=excluded.is_closed; COMMIT;";
 runSql(sql);
 return complete.length;
}
async function cycle(){
 for(const interval of intervals){
  try{const count=await collect(interval);console.log(new Date().toISOString(),interval,"completed/upserted",count)}
  catch(e){console.error(new Date().toISOString(),interval,"ERROR",e.message)}
 }
}
await cycle();
if(loop){console.log("Foreground loop: Ctrl-C stops; PM2 was not modified.");while(true){await new Promise(r=>setTimeout(r,every*1000));await cycle()}}
