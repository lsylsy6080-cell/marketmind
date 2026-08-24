import "dotenv/config";
import { supabase } from "../lib/supabase";
import type { ExchangeFuturesSnapshot,FuturesExchange,GlobalFuturesSnapshot } from "./types";
import {normalizeBinanceTrades,normalizeBybitTrades,normalizeGateTrades,normalizeMexcTrades,normalizeOkxTrades} from "./TakerFlowNormalizer";

const num=(v:unknown):number|null=>{const n=Number(v);return Number.isFinite(n)?n:null};
const safeUsd=(a:number|null,b:number|null)=>a!=null&&b!=null?a*b:null;
async function json(url:string){
  const r=await fetch(url,{signal:AbortSignal.timeout(10_000),headers:{"user-agent":"MarketMind/7.11"}});
  if(!r.ok)throw new Error(`HTTP ${r.status} ${url}`);
  return r.json() as Promise<any>;
}
function fail(exchange:FuturesExchange,symbol:string,e:unknown):ExchangeFuturesSnapshot{
  return {exchange,symbol,fetchedAt:new Date().toISOString(),lastPrice:null,markPrice:null,volume24hBase:null,
    turnover24hUsd:null,openInterestBase:null,openInterestUsd:null,fundingRate:null,
    takerBuyUsd:null,takerSellUsd:null,takerBuyRatio:null,available:false,error:e instanceof Error?e.message:String(e)};
}

async function binance():Promise<ExchangeFuturesSnapshot>{
  try{
    const [ticker,oi,premium,taker]=await Promise.all([
      json("https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=BTCUSDT"),
      json("https://fapi.binance.com/fapi/v1/openInterest?symbol=BTCUSDT"),
      json("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"),
      json("https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=500").catch(()=>[]),
    ]);
    const price=num(ticker.lastPrice),base=num(ticker.volume),turnover=num(ticker.quoteVolume);
    const oiBase=num(oi.openInterest);
    const flow=normalizeBinanceTrades(Array.isArray(taker)?taker:[]);
    const buyUsd=flow.sampleCount>0?flow.buyUsd:null,sellUsd=flow.sampleCount>0?flow.sellUsd:null;
    return {exchange:"binance",symbol:"BTCUSDT",fetchedAt:new Date().toISOString(),lastPrice:price,
      markPrice:num(premium.markPrice),volume24hBase:base,turnover24hUsd:turnover,
      openInterestBase:oiBase,openInterestUsd:safeUsd(oiBase,price),fundingRate:num(premium.lastFundingRate),
      takerBuyUsd:buyUsd,takerSellUsd:sellUsd,takerBuyRatio:buyUsd!=null&&sellUsd!=null&&buyUsd+sellUsd>0?buyUsd/(buyUsd+sellUsd):null,
      available:true,error:null};
  }catch(e){return fail("binance","BTCUSDT",e)}
}

async function bybit():Promise<ExchangeFuturesSnapshot>{
  try{
    const [x,trades]=await Promise.all([json("https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT"),json("https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=BTCUSDT&limit=500").catch(()=>null)]);
    const t=x?.result?.list?.[0]; if(!t)throw new Error("empty ticker");
    const flow=normalizeBybitTrades(Array.isArray(trades?.result?.list)?trades.result.list:[]);
    const price=num(t.lastPrice),oiBase=num(t.openInterest);
    return {exchange:"bybit",symbol:"BTCUSDT",fetchedAt:new Date().toISOString(),lastPrice:price,markPrice:num(t.markPrice),
      volume24hBase:num(t.volume24h),turnover24hUsd:num(t.turnover24h),openInterestBase:oiBase,
      openInterestUsd:num(t.openInterestValue)??safeUsd(oiBase,price),fundingRate:num(t.fundingRate),
      takerBuyUsd:flow.sampleCount>0?flow.buyUsd:null,takerSellUsd:flow.sampleCount>0?flow.sellUsd:null,takerBuyRatio:flow.buyRatio,available:true,error:null};
  }catch(e){return fail("bybit","BTCUSDT",e)}
}

async function okx():Promise<ExchangeFuturesSnapshot>{
  try{
    const [tick,oi,funding,instrument,trades]=await Promise.all([
      json("https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT-SWAP"),
      json("https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP"),
      json("https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP"),
      json("https://www.okx.com/api/v5/public/instruments?instType=SWAP&instId=BTC-USDT-SWAP"),
      json("https://www.okx.com/api/v5/market/trades?instId=BTC-USDT-SWAP&limit=500").catch(()=>null),
    ]);
    const t=tick?.data?.[0],o=oi?.data?.[0],f=funding?.data?.[0]; if(!t)throw new Error("empty ticker");
    const price=num(t.last),oiBase=num(o?.oiCcy)??num(o?.oi);
    const ctVal=num(instrument?.data?.[0]?.ctVal);
    const flow=ctVal!=null&&ctVal>0?normalizeOkxTrades(Array.isArray(trades?.data)?trades.data:[],ctVal):{buyUsd:0,sellUsd:0,buyRatio:null,sampleCount:0};
    return {exchange:"okx",symbol:"BTC-USDT-SWAP",fetchedAt:new Date().toISOString(),lastPrice:price,markPrice:null,
      volume24hBase:num(t.volCcy24h),turnover24hUsd:safeUsd(num(t.volCcy24h),price),openInterestBase:oiBase,
      openInterestUsd:num(o?.oiUsd)??safeUsd(oiBase,price),fundingRate:num(f?.fundingRate),
      takerBuyUsd:flow.sampleCount>0?flow.buyUsd:null,takerSellUsd:flow.sampleCount>0?flow.sellUsd:null,takerBuyRatio:flow.buyRatio,available:true,error:null};
  }catch(e){return fail("okx","BTC-USDT-SWAP",e)}
}

async function gate():Promise<ExchangeFuturesSnapshot>{
  try{
    const [arr,contract,trades]=await Promise.all([
      json("https://api.gateio.ws/api/v4/futures/usdt/tickers?contract=BTC_USDT"),
      json("https://api.gateio.ws/api/v4/futures/usdt/contracts/BTC_USDT"),
      json("https://api.gateio.ws/api/v4/futures/usdt/trades?contract=BTC_USDT&limit=500").catch(()=>[]),
    ]);
    const t=Array.isArray(arr)?arr[0]:arr; if(!t)throw new Error("empty ticker");
    const price=num(t.last),base=num(t.volume_24h_base),turnover=num(t.volume_24h_quote);
    const contractCount=num(t.total_size);
    const multiplier=num(contract?.quanto_multiplier);
    if(multiplier==null||multiplier<=0)throw new Error("invalid Gate quanto_multiplier");
    const oiBase=contractCount==null?null:contractCount*multiplier;
    const flow=normalizeGateTrades(Array.isArray(trades)?trades:[],multiplier);
    return {exchange:"gate",symbol:"BTC_USDT",fetchedAt:new Date().toISOString(),lastPrice:price,markPrice:num(t.mark_price),
      volume24hBase:base,turnover24hUsd:turnover??safeUsd(base,price),openInterestBase:oiBase,
      openInterestUsd:safeUsd(oiBase,price),fundingRate:num(t.funding_rate),
      takerBuyUsd:flow.sampleCount>0?flow.buyUsd:null,takerSellUsd:flow.sampleCount>0?flow.sellUsd:null,takerBuyRatio:flow.buyRatio,available:true,error:null};
  }catch(e){return fail("gate","BTC_USDT",e)}
}

async function mexc():Promise<ExchangeFuturesSnapshot>{
  try{
    const [x,detail,deals]=await Promise.all([
      json("https://contract.mexc.com/api/v1/contract/ticker?symbol=BTC_USDT"),
      json("https://contract.mexc.com/api/v1/contract/detail"),
      json("https://contract.mexc.com/api/v1/contract/deals/BTC_USDT").catch(()=>null),
    ]);
    const t=x?.data; if(!t)throw new Error("empty ticker");
    const contracts=Array.isArray(detail?.data)?detail.data:[];
    const btcContract=contracts.find((c:any)=>c?.symbol==="BTC_USDT");
    const contractSize=num(btcContract?.contractSize);
    if(contractSize==null||contractSize<=0)throw new Error("invalid MEXC contractSize");

    const price=num(t.lastPrice);
    const volumeContracts=num(t.volume24);
    const holdContracts=num(t.holdVol);
    const base=volumeContracts==null?null:volumeContracts*contractSize;
    const oiBase=holdContracts==null?null:holdContracts*contractSize;
    const turnover=num(t.amount24);
    const flow=normalizeMexcTrades(Array.isArray(deals?.data)?deals.data:[],contractSize);

    return {exchange:"mexc",symbol:"BTC_USDT",fetchedAt:new Date().toISOString(),lastPrice:price,markPrice:num(t.fairPrice),
      volume24hBase:base,turnover24hUsd:turnover??safeUsd(base,price),openInterestBase:oiBase,
      openInterestUsd:safeUsd(oiBase,price),fundingRate:num(t.fundingRate),
      takerBuyUsd:flow.sampleCount>0?flow.buyUsd:null,takerSellUsd:flow.sampleCount>0?flow.sellUsd:null,takerBuyRatio:flow.buyRatio,available:true,error:null};
  }catch(e){return fail("mexc","BTC_USDT",e)}
}

export async function collectGlobalFuturesSnapshot():Promise<GlobalFuturesSnapshot>{
  const exchanges=await Promise.all([binance(),okx(),bybit(),gate(),mexc()]);
  const healthy=exchanges.filter(x=>x.available);
  const turnover=healthy.reduce((s,x)=>s+(x.turnover24hUsd??0),0);
  const oiUsd=healthy.reduce((s,x)=>s+(x.openInterestUsd??0),0);
  const fundingRows=healthy.filter(x=>x.fundingRate!=null&&x.openInterestUsd!=null&&x.openInterestUsd!>0);
  const fundingDen=fundingRows.reduce((s,x)=>s+(x.openInterestUsd??0),0);
  const weightedFunding=fundingDen>0?fundingRows.reduce((s,x)=>s+(x.fundingRate??0)*(x.openInterestUsd??0),0)/fundingDen:null;
  const takerRows=healthy.filter(x=>x.takerBuyUsd!=null&&x.takerSellUsd!=null);
  const buys=takerRows.reduce((s,x)=>s+(x.takerBuyUsd??0),0),sells=takerRows.reduce((s,x)=>s+(x.takerSellUsd??0),0);
  const takerTotal=buys+sells;
  const result:GlobalFuturesSnapshot={
    symbol:"BTCUSDT",fetchedAt:new Date().toISOString(),exchangeCount:5,healthyExchangeCount:healthy.length,
    totalTurnover24hUsd:turnover,totalOpenInterestUsd:oiUsd,weightedFundingRate:weightedFunding,
    globalTakerBuyRatio:takerTotal>0?buys/takerTotal:null,globalTakerSellRatio:takerTotal>0?sells/takerTotal:null,
    takerSourceCount:takerRows.length,
    takerSourceCoveragePercent:healthy.length>0?takerRows.length/healthy.length*100:0,
    exchanges,strategyVersion:"global-futures-intelligence-v7.11.2-taker5"
  };
  const bucket=new Date(Math.floor(Date.now()/60_000)*60_000).toISOString();
  for(const x of exchanges){
    const {error}=await supabase.from("global_futures_exchange_snapshots").upsert({
      bucket_time:bucket,fetched_at:x.fetchedAt,exchange:x.exchange,symbol:x.symbol,last_price:x.lastPrice,mark_price:x.markPrice,
      volume_24h_base:x.volume24hBase,turnover_24h_usd:x.turnover24hUsd,open_interest_base:x.openInterestBase,
      open_interest_usd:x.openInterestUsd,funding_rate:x.fundingRate,taker_buy_usd:x.takerBuyUsd,taker_sell_usd:x.takerSellUsd,
      taker_buy_ratio:x.takerBuyRatio,available:x.available,error:x.error,strategy_version:result.strategyVersion
    },{onConflict:"exchange,bucket_time"});
    if(error)throw new Error(`[Global Futures] ${x.exchange} save failed: ${error.message}`);
  }
  const {error}=await supabase.from("global_futures_snapshots").upsert({
    bucket_time:bucket,fetched_at:result.fetchedAt,symbol:result.symbol,exchange_count:5,healthy_exchange_count:healthy.length,
    total_turnover_24h_usd:result.totalTurnover24hUsd,total_open_interest_usd:result.totalOpenInterestUsd,
    weighted_funding_rate:result.weightedFundingRate,global_taker_buy_ratio:result.globalTakerBuyRatio,
    global_taker_sell_ratio:result.globalTakerSellRatio,taker_source_count:result.takerSourceCount,
    taker_source_coverage_percent:result.takerSourceCoveragePercent,strategy_version:result.strategyVersion
  },{onConflict:"symbol,bucket_time"});
  if(error)throw new Error(`[Global Futures] aggregate save failed: ${error.message}`);
  return result;
}
