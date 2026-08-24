import WebSocket from "ws";
import { supabase } from "../lib/supabase";
import { classifyLiquidationWindow } from "./LiquidationIntelligenceEngine";
import type { LiquidationMinuteSnapshot } from "./types";

const WS_URL="wss://fstream.binance.com/ws/btcusdt@forceOrder";
const SYMBOL="BTCUSDT";

type BufferState={
  bucketMs:number;
  startedAt:string;
  eventCount:number;
  longUsd:number;
  shortUsd:number;
  firstPrice:number|null;
  lastPrice:number|null;
};

const round=(v:number,d=8)=>{const m=10**d;return Math.round(v*m)/m};
const median=(values:number[]):number|null=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const m=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;
};

function newBuffer(now=Date.now()):BufferState{
  const bucketMs=Math.floor(now/60_000)*60_000;
  return {
    bucketMs,startedAt:new Date(bucketMs).toISOString(),
    eventCount:0,longUsd:0,shortUsd:0,firstPrice:null,lastPrice:null,
  };
}

async function recentMedianTotalUsd():Promise<number|null>{
  const since=new Date(Date.now()-60*60_000).toISOString();
  const {data,error}=await supabase.from("btc_liquidation_snapshots")
    .select("total_liquidation_usd").eq("symbol",SYMBOL)
    .gte("bucket_time",since).order("bucket_time",{ascending:false}).limit(60);
  if(error) throw new Error(`[Liquidation] median 조회 실패: ${error.message}`);
  return median((data??[]).map((r:any)=>Number(r.total_liquidation_usd)).filter(Number.isFinite));
}

async function saveWindow(buffer:BufferState,streamHealthy:boolean):Promise<LiquidationMinuteSnapshot>{
  const med=await recentMedianTotalUsd().catch(()=>null);
  const evaluation=classifyLiquidationWindow({
    longLiquidationUsd:buffer.longUsd,
    shortLiquidationUsd:buffer.shortUsd,
    firstPrice:buffer.firstPrice,
    lastPrice:buffer.lastPrice,
    recentMedianTotalUsd:med,
    streamHealthy,
  });

  const snapshot:LiquidationMinuteSnapshot={
    symbol:"BTCUSDT",
    bucketTime:new Date(buffer.bucketMs).toISOString(),
    startedAt:buffer.startedAt,
    endedAt:new Date(buffer.bucketMs+60_000).toISOString(),
    eventCount:buffer.eventCount,
    longLiquidationUsd:round(buffer.longUsd,2),
    shortLiquidationUsd:round(buffer.shortUsd,2),
    totalLiquidationUsd:round(buffer.longUsd+buffer.shortUsd,2),
    ...evaluation,
    firstPrice:buffer.firstPrice==null?null:round(buffer.firstPrice,2),
    lastPrice:buffer.lastPrice==null?null:round(buffer.lastPrice,2),
    streamHealthy,
    strategyVersion:"liquidation-intelligence-v7.10",
  };

  const {error}=await supabase.from("btc_liquidation_snapshots").upsert({
    symbol:snapshot.symbol,bucket_time:snapshot.bucketTime,
    started_at:snapshot.startedAt,ended_at:snapshot.endedAt,
    event_count:snapshot.eventCount,long_liquidation_usd:snapshot.longLiquidationUsd,
    short_liquidation_usd:snapshot.shortLiquidationUsd,total_liquidation_usd:snapshot.totalLiquidationUsd,
    dominance_ratio:snapshot.dominanceRatio,dominant_side:snapshot.dominantSide,
    first_price:snapshot.firstPrice,last_price:snapshot.lastPrice,
    price_change_percent:snapshot.priceChangePercent,burst_multiple:snapshot.burstMultiple,
    state:snapshot.state,directional_bias:snapshot.directionalBias,confidence:snapshot.confidence,
    entry_adjustment:snapshot.entryAdjustment,overheat_adjustment:snapshot.overheatAdjustment,
    reversal_adjustment:snapshot.reversalAdjustment,reasons:snapshot.reasons,
    stream_healthy:snapshot.streamHealthy,strategy_version:snapshot.strategyVersion,
  },{onConflict:"symbol,bucket_time"});
  if(error) throw new Error(`[Liquidation] snapshot 저장 실패: ${error.message}`);
  return snapshot;
}

export class LiquidationStreamCollector{
  private ws:WebSocket|null=null;
  private stopped=false;
  private reconnectDelayMs=2_000;
  private flushTimer:NodeJS.Timeout|null=null;
  private buffer:BufferState=newBuffer();
  private lastMessageAt=0;
  private hadDisconnectSinceFlush=false;

  async start():Promise<void>{
    this.stopped=false;
    this.connect();
    this.flushTimer=setInterval(()=>void this.rotateIfNeeded(),5_000);
  }

  private connect():void{
    if(this.stopped)return;
    const ws=new WebSocket(WS_URL);
    this.ws=ws;

    ws.on("open",()=>{
      this.reconnectDelayMs=2_000;
      console.log("[Liquidation] Binance forceOrder stream connected");
    });

    ws.on("message",(raw)=>{
      try{
        const event=JSON.parse(raw.toString()) as any;
        const order=event?.o;
        if(!order||order.s!==SYMBOL)return;

        const eventTime=Number(event.E??Date.now());
        void this.rotateIfNeeded(eventTime);

        const price=Number(order.ap??order.p);
        const qty=Number(order.z??order.q);
        if(!Number.isFinite(price)||!Number.isFinite(qty)||price<=0||qty<=0)return;
        const usd=price*qty;

        // Forced SELL = LONG liquidation, Forced BUY = SHORT liquidation.
        if(order.S==="SELL")this.buffer.longUsd+=usd;
        else if(order.S==="BUY")this.buffer.shortUsd+=usd;
        else return;

        this.buffer.eventCount+=1;
        if(this.buffer.firstPrice==null)this.buffer.firstPrice=price;
        this.buffer.lastPrice=price;
        this.lastMessageAt=Date.now();
      }catch(error){
        console.error("[Liquidation] message parse error",error);
      }
    });

    ws.on("close",()=>{
      this.hadDisconnectSinceFlush=true;
      if(this.stopped)return;
      console.warn(`[Liquidation] stream closed · reconnect ${this.reconnectDelayMs/1000}s`);
      setTimeout(()=>this.connect(),this.reconnectDelayMs);
      this.reconnectDelayMs=Math.min(30_000,this.reconnectDelayMs*2);
    });

    ws.on("error",(error)=>{
      this.hadDisconnectSinceFlush=true;
      console.error("[Liquidation] websocket error",error.message);
    });
  }

  private async rotateIfNeeded(now=Date.now()):Promise<void>{
    const currentBucket=Math.floor(now/60_000)*60_000;
    if(currentBucket<=this.buffer.bucketMs)return;

    const old=this.buffer;
    this.buffer=newBuffer(now);

    const socketOpen=this.ws?.readyState===WebSocket.OPEN;
    const healthy=Boolean(socketOpen) && !this.hadDisconnectSinceFlush;
    this.hadDisconnectSinceFlush=false;

    try{
      const result=await saveWindow(old,healthy);
      console.log(
        `[Liquidation] ${result.state} · long=$${Math.round(result.longLiquidationUsd).toLocaleString()}`+
        ` short=$${Math.round(result.shortLiquidationUsd).toLocaleString()}`+
        ` burst=${result.burstMultiple??"-"}x`,
      );
    }catch(error){
      console.error("[Liquidation] flush failed",error);
    }
  }

  async stop():Promise<void>{
    this.stopped=true;
    if(this.flushTimer)clearInterval(this.flushTimer);
    this.flushTimer=null;
    try{await this.rotateIfNeeded(this.buffer.bucketMs+60_000);}catch{}
    if(this.ws){
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws=null;
    }
  }
}

export async function getLatestLiquidationSnapshot(){
  const {data,error}=await supabase.from("btc_liquidation_snapshots")
    .select("*").eq("symbol",SYMBOL).order("bucket_time",{ascending:false}).limit(1).maybeSingle();
  if(error)throw new Error(`[Liquidation] latest 조회 실패: ${error.message}`);
  return data;
}
