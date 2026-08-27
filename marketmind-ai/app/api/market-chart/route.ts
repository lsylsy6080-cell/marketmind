import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DIRECT_INTERVALS = new Set(["1m", "5m", "15m", "1h", "4h", "1d", "1w"]);
const ALLOWED_INTERVALS = new Set([...DIRECT_INTERVALS, "1M"]);
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;

type MarketCandleRow = {open_time:string;open:number|string;high:number|string;low:number|string;close:number|string;volume:number|string|null};
type Candle = {time:number;open:number;high:number;low:number;close:number;volume:number};
function toNumber(value:number|string|null){const parsed=Number(value??0);return Number.isFinite(parsed)?parsed:0}
function toCandle(row:MarketCandleRow):Candle{return {time:Math.floor(new Date(row.open_time).getTime()/1000),open:toNumber(row.open),high:toNumber(row.high),low:toNumber(row.low),close:toNumber(row.close),volume:toNumber(row.volume)}}
function valid(c:Candle){return Number.isFinite(c.time)&&c.time>0&&c.open>0&&c.high>0&&c.low>0&&c.close>0}
function monthKey(t:number){const d=new Date(t*1000);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`}
function aggregateMonthly(daily:Candle[]){const groups=new Map<string,Candle[]>();for(const c of daily){const k=monthKey(c.time);const a=groups.get(k)??[];a.push(c);groups.set(k,a)}return [...groups.values()].map(g=>({time:g[0].time,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g[g.length-1].close,volume:g.reduce((s,x)=>s+x.volume,0)}))}

export async function GET(request:NextRequest){
 const interval=request.nextUrl.searchParams.get("interval")??"1m";
 const symbol=(request.nextUrl.searchParams.get("symbol")??"BTCUSDT").toUpperCase();
 const rawLimit=Number(request.nextUrl.searchParams.get("limit")??DEFAULT_LIMIT);
 const rawEndTime=Number(request.nextUrl.searchParams.get("endTime")??"");
 if(!ALLOWED_INTERVALS.has(interval)||symbol!=="BTCUSDT")return NextResponse.json({ok:false,error:"지원하지 않는 심볼 또는 시간봉입니다."},{status:400});
 const limit=Number.isFinite(rawLimit)?Math.min(MAX_LIMIT,Math.max(1,Math.floor(rawLimit))):DEFAULT_LIMIT;
 try{
  const supabase=createAdminClient();
  const queryInterval=interval==="1M"?"1d":interval;
  const queryLimit=interval==="1M"?Math.min(5000,limit*35+35):limit+1;
  let query=supabase.from("market_candles").select("open_time,open,high,low,close,volume").eq("exchange","binance").eq("market_type","spot").eq("symbol",symbol).eq("timeframe",queryInterval).eq("is_closed",true).order("open_time",{ascending:false}).limit(queryLimit);
  if(Number.isFinite(rawEndTime)&&rawEndTime>0)query=query.lt("open_time",new Date(rawEndTime).toISOString());
  const {data,error}=await query;if(error)throw error;
  const rows=(data??[]) as MarketCandleRow[];
  if(interval==="1M"){
    const daily=rows.map(toCandle).filter(valid).reverse();
    let monthly=aggregateMonthly(daily);
    const hasMore=monthly.length>limit || rows.length>=queryLimit;
    monthly=monthly.slice(Math.max(0,monthly.length-limit));
    if(!monthly.length)return NextResponse.json({ok:false,error:"월봉 생성을 위한 일봉 데이터가 없습니다."},{status:404,headers:{"Cache-Control":"no-store"}});
    return NextResponse.json({ok:true,symbol,interval,candles:monthly,hasMore,source:"supabase:1d:monthly-aggregate",fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=30, stale-while-revalidate=60"}});
  }
  const hasMore=rows.length>limit;const selected=rows.slice(0,limit);const candles=selected.map(toCandle).filter(valid).reverse();
  if(!candles.length)return NextResponse.json({ok:false,error:`Supabase market_candles에 ${symbol} ${interval} 데이터가 없습니다.`},{status:404,headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({ok:true,symbol,interval,candles,hasMore,source:`supabase:${interval}:direct`,fetchedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, s-maxage=10, stale-while-revalidate=30"}});
 }catch(error){console.error("[market-chart] query failed",error);return NextResponse.json({ok:false,error:error instanceof Error?`Supabase 차트 조회 실패: ${error.message}`:"Supabase 차트 데이터를 불러오지 못했습니다."},{status:502,headers:{"Cache-Control":"no-store"}})}
}
