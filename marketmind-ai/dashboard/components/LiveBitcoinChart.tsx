"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type Coordinate,
  type IChartApi,
  type IPriceLine,
  type ISeriesMarkersPluginApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { PaperPosition } from "../types";
import { calculateLivePositionMetrics } from "../live-position";
import {
  adxSeries,
  analyzeLongTermTrend,
  atrSeries,
  combineLongTermTrends,
  emaData,
  ichimokuSeries,
  rsiSeries,
  type TrendCandle,
  type TrendSummary,
} from "../long-term-trend";

type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
type Candle = TrendCandle;
type KlinePayload = { e?: string; k?: { t: number; o: string; h: string; l: string; c: string; v: string } };
type OverlayKey = "ema" | "ichimoku" | "structure" | "sr" | "volume";
type ViewMode = "clean" | "trend" | "full";

const intervals: { value: Interval; label: string }[] = [
  { value: "1m", label: "1분" },{ value: "5m", label: "5분" },{ value: "15m", label: "15분" },{ value: "1h", label: "1시간" },
  { value: "4h", label: "4시간" },{ value: "1d", label: "1일" },{ value: "1w", label: "1주" },{ value: "1M", label: "1개월" },
];
const initialTargets:Record<Interval,number>={"1m":1000,"5m":1600,"15m":1800,"1h":1800,"4h":2200,"1d":1800,"1w":1000,"1M":600};

function toChartCandle(c:Candle){return {time:c.time as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close}}
function signed(value:number,digits=2){return `${value>=0?"+":""}${value.toFixed(digits)}`}
function money(value:number|null|undefined){return value&&Number.isFinite(value)?`$${value.toLocaleString("en-US",{maximumFractionDigits:1})}`:"-"}
function directionClass(t:TrendSummary|null){return t?.direction.includes("bull")?"bullish":t?.direction.includes("bear")?"bearish":"neutral"}
function pctDistance(v:number|null){return v==null?"-":`${v>=0?"+":""}${v.toFixed(2)}%`}
function scoreBar(score:number,max:number){const denom=Math.max(1,max);return Math.min(100,Math.abs(score)/denom*100)}

async function fetchCandleBlock(interval:Interval,limit:number,endTime?:number){
 const params=new URLSearchParams({symbol:"BTCUSDT",interval,limit:String(Math.min(1000,limit))});if(endTime!=null)params.set("endTime",String(endTime));
 const r=await fetch(`/api/market-chart?${params.toString()}`,{cache:"no-store"});const p=await r.json();if(!r.ok||!p.ok)throw new Error(p.error??"차트 데이터 오류");return p as {candles:Candle[];hasMore:boolean};
}
async function fetchMany(interval:Interval,target:number){let all:Candle[]=[];let end:number|undefined;let more=true;while(more&&all.length<target){const p=await fetchCandleBlock(interval,Math.min(1000,target-all.length),end);if(!p.candles.length)break;const map=new Map<number,Candle>();for(const c of [...p.candles,...all])map.set(c.time,c);all=[...map.values()].sort((a,b)=>a.time-b.time);more=Boolean(p.hasMore);end=p.candles[0].time*1000-1;if(p.candles.length<Math.min(1000,target-all.length+p.candles.length))more=false}return {candles:all,hasMore:more}}

function MiniSparkline({values,label,value,guide}:{values:number[];label:string;value:string;guide?:number}){
 const clean=values.filter(Number.isFinite).slice(-80);if(clean.length<2)return <div className="trend-mini"><div><span>{label}</span><b>{value}</b></div><div className="trend-mini-empty">데이터 수집 중</div></div>;
 const min=Math.min(...clean),max=Math.max(...clean),range=Math.max(1e-9,max-min);const pts=clean.map((v,i)=>`${(i/(clean.length-1))*100},${36-((v-min)/range)*30}`).join(" ");
 const gy=guide!=null?36-((guide-min)/range)*30:null;
 return <div className="trend-mini"><div><span>{label}</span><b>{value}</b></div><svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">{gy!=null&&gy>=3&&gy<=38?<line x1="0" x2="100" y1={gy} y2={gy} className="guide"/>:null}<polyline points={pts}/></svg></div>
}

export function LiveBitcoinChart({positions=[]}:{positions?:PaperPosition[]}){
 const containerRef=useRef<HTMLDivElement|null>(null),cloudCanvasRef=useRef<HTMLCanvasElement|null>(null);const chartRef=useRef<IChartApi|null>(null);const candleSeriesRef=useRef<ISeriesApi<"Candlestick">|null>(null);
 const ema20Ref=useRef<ISeriesApi<"Line">|null>(null),ema50Ref=useRef<ISeriesApi<"Line">|null>(null),ema100Ref=useRef<ISeriesApi<"Line">|null>(null),ema200Ref=useRef<ISeriesApi<"Line">|null>(null);
 const tenkanRef=useRef<ISeriesApi<"Line">|null>(null),kijunRef=useRef<ISeriesApi<"Line">|null>(null),spanARef=useRef<ISeriesApi<"Line">|null>(null),spanBRef=useRef<ISeriesApi<"Line">|null>(null),volumeRef=useRef<ISeriesApi<"Histogram">|null>(null);
 const entryRef=useRef<IPriceLine|null>(null),stopRef=useRef<IPriceLine|null>(null),takeRef=useRef<IPriceLine|null>(null),supportRef=useRef<IPriceLine|null>(null),resistanceRef=useRef<IPriceLine|null>(null);const markerApiRef=useRef<ISeriesMarkersPluginApi<Time>|null>(null);
 const candlesRef=useRef<Candle[]>([]),loadingOlderRef=useRef(false),hasMoreRef=useRef(true),intervalRef=useRef<Interval>("1d"),lastUiRefreshRef=useRef(0);
 const [interval,setIntervalValue]=useState<Interval>("1d"),[candles,setCandles]=useState<Candle[]>([]),[status,setStatus]=useState<"loading"|"live"|"reconnecting"|"error">("loading"),[error,setError]=useState<string|null>(null),[loadingOlder,setLoadingOlder]=useState(false);
 const [overlays,setOverlays]=useState<Record<OverlayKey,boolean>>({ema:false,ichimoku:true,structure:true,sr:true,volume:true});
 const [viewMode,setViewMode]=useState<ViewMode>("trend");
 const [contexts,setContexts]=useState<{w:TrendSummary|null;d:TrendSummary|null;h4:TrendSummary|null}>({w:null,d:null,h4:null});
 const [trendHistory,setTrendHistory]=useState<{at:number;score:number;risk:number;price:number;label:string}[]>([]);
 useEffect(()=>{intervalRef.current=interval},[interval]);

 const selectedTrend=useMemo(()=>candles.length>=80?analyzeLongTermTrend(candles,interval==='4h'?'4h':interval==='1d'?'1d':interval==='1w'?'1w':interval==='1M'?'1M':'1h'):null,[candles,interval]);
 const combined=useMemo(()=>combineLongTermTrends(contexts.w,contexts.d,contexts.h4),[contexts]);
 const rsi=useMemo(()=>rsiSeries(candles),[candles]),adx=useMemo(()=>adxSeries(candles),[candles]),atr=useMemo(()=>atrSeries(candles),[candles]);

 useEffect(()=>{
  if(!combined)return;
  try{
   const key='marketmind-long-trend-history-v1';
   const current=JSON.parse(localStorage.getItem(key)??'[]') as {at:number;score:number;risk:number;price:number;label:string}[];
   const now=Date.now(),price=contexts.h4?.lastPrice??contexts.d?.lastPrice??contexts.w?.lastPrice??0;
   const last=current.at(-1);
   const shouldSave=!last||now-last.at>=5*60_000||Math.abs(last.score-combined.score)>=4||last.label!==combined.label;
   const next=shouldSave?[...current,{at:now,score:combined.score,risk:combined.risk,price,label:combined.label}].slice(-288):current.slice(-288);
   if(shouldSave)localStorage.setItem(key,JSON.stringify(next));
   setTrendHistory(next);
  }catch{}
 },[combined,contexts]);

 useEffect(()=>{let dead=false;(async()=>{try{const [w,d,h4]=await Promise.all([fetchMany("1w",700),fetchMany("1d",1800),fetchMany("4h",1600)]);if(dead)return;setContexts({w:w.candles.length?analyzeLongTermTrend(w.candles,'1w'):null,d:d.candles.length?analyzeLongTermTrend(d.candles,'1d'):null,h4:h4.candles.length?analyzeLongTermTrend(h4.candles,'4h'):null})}catch(e){console.warn("[장기추세] 멀티타임프레임 로드 실패",e)}})();return()=>{dead=true}},[]);

 useEffect(()=>{
  if(!containerRef.current)return;const container=containerRef.current;const chart=createChart(container,{width:container.clientWidth,height:640,layout:{background:{type:ColorType.Solid,color:"#0b1020"},textColor:"#8892a8",attributionLogo:true},grid:{vertLines:{color:"rgba(148,163,184,.07)"},horzLines:{color:"rgba(148,163,184,.07)"}},crosshair:{mode:CrosshairMode.Normal,vertLine:{color:"rgba(148,163,184,.42)",labelBackgroundColor:"#334155"},horzLine:{color:"rgba(148,163,184,.42)",labelBackgroundColor:"#334155"}},rightPriceScale:{borderColor:"rgba(148,163,184,.16)",scaleMargins:{top:.07,bottom:.23}},timeScale:{borderColor:"rgba(148,163,184,.16)",timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:5},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true}});
  const candle=chart.addSeries(CandlestickSeries,{upColor:"#26a69a",downColor:"#ef5350",borderVisible:false,wickUpColor:"#26a69a",wickDownColor:"#ef5350",priceLineVisible:true,lastValueVisible:true});
  ema20Ref.current=chart.addSeries(LineSeries,{color:"#22c55e",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});ema50Ref.current=chart.addSeries(LineSeries,{color:"#38bdf8",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});ema100Ref.current=chart.addSeries(LineSeries,{color:"#f59e0b",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});ema200Ref.current=chart.addSeries(LineSeries,{color:"#d946ef",lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
  tenkanRef.current=chart.addSeries(LineSeries,{color:"#2196f3",lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});kijunRef.current=chart.addSeries(LineSeries,{color:"#ff9800",lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});spanARef.current=chart.addSeries(LineSeries,{color:"rgba(76,175,80,.78)",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});spanBRef.current=chart.addSeries(LineSeries,{color:"rgba(239,83,80,.72)",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
  volumeRef.current=chart.addSeries(HistogramSeries,{priceScaleId:"volume",priceFormat:{type:"volume"},lastValueVisible:false,priceLineVisible:false});chart.priceScale("volume").applyOptions({scaleMargins:{top:.82,bottom:0}});
  chartRef.current=chart;candleSeriesRef.current=candle;markerApiRef.current=createSeriesMarkers(candle,[] as SeriesMarker<Time>[]);
  const ro=new ResizeObserver(()=>{if(containerRef.current)chart.applyOptions({width:containerRef.current.clientWidth})});ro.observe(container);return()=>{ro.disconnect();chart.remove();chartRef.current=null;candleSeriesRef.current=null;markerApiRef.current=null}
 },[]);

 function applyAll(history:Candle[]){
  candleSeriesRef.current?.setData(history.map(toChartCandle));ema20Ref.current?.setData(emaData(history,20).map(x=>({time:x.time as UTCTimestamp,value:x.value})));ema50Ref.current?.setData(emaData(history,50).map(x=>({time:x.time as UTCTimestamp,value:x.value})));ema100Ref.current?.setData(emaData(history,100).map(x=>({time:x.time as UTCTimestamp,value:x.value})));ema200Ref.current?.setData(emaData(history,200).map(x=>({time:x.time as UTCTimestamp,value:x.value})));
  const ichi=ichimokuSeries(history);const step=history.length>1?Math.max(60,history[1].time-history[0].time):3600;tenkanRef.current?.setData(ichi.filter(x=>x.conversion!=null).map(x=>({time:x.time as UTCTimestamp,value:x.conversion!})));kijunRef.current?.setData(ichi.filter(x=>x.base!=null).map(x=>({time:x.time as UTCTimestamp,value:x.base!})));spanARef.current?.setData(ichi.filter(x=>x.spanA!=null).map(x=>({time:(x.time+26*step) as UTCTimestamp,value:x.spanA!})));spanBRef.current?.setData(ichi.filter(x=>x.spanB!=null).map(x=>({time:(x.time+26*step) as UTCTimestamp,value:x.spanB!})));
  volumeRef.current?.setData(history.map(x=>({time:x.time as UTCTimestamp,value:x.volume,color:x.close>=x.open?"rgba(38,166,154,.42)":"rgba(239,83,80,.38)"})));
  requestAnimationFrame(()=>drawIchimokuCloud(history));
 }

 function drawIchimokuCloud(history:Candle[]){
  const canvas=cloudCanvasRef.current,chart=chartRef.current,series=candleSeriesRef.current;if(!canvas||!chart||!series)return;
  const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,Math.floor(rect.width*dpr));canvas.height=Math.max(1,Math.floor(rect.height*dpr));
  const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);if(!overlays.ichimoku||history.length<60)return;
  const ichi=ichimokuSeries(history),step=history.length>1?Math.max(60,history[1].time-history[0].time):3600;
  const pts=ichi.filter(x=>x.spanA!=null&&x.spanB!=null).map(x=>{const time=(x.time+26*step) as UTCTimestamp;return {x:chart.timeScale().timeToCoordinate(time),a:series.priceToCoordinate(x.spanA!),b:series.priceToCoordinate(x.spanB!),bull:x.spanA!>=x.spanB!}}).filter((p):p is {x:Coordinate;a:Coordinate;b:Coordinate;bull:boolean}=>p.x!=null&&p.a!=null&&p.b!=null);
  if(pts.length<2)return;
  let start=0;
  for(let i=1;i<=pts.length;i++){const boundary=i===pts.length||pts[i].bull!==pts[start].bull;if(!boundary)continue;const seg=pts.slice(start,i);if(seg.length>=2){ctx.beginPath();ctx.moveTo(seg[0].x,seg[0].a);for(const p of seg.slice(1))ctx.lineTo(p.x,p.a);for(const p of [...seg].reverse())ctx.lineTo(p.x,p.b);ctx.closePath();ctx.fillStyle=seg[0].bull?"rgba(76,175,80,.22)":"rgba(239,83,80,.18)";ctx.fill();}start=Math.max(0,i-1);}
 }

 useEffect(()=>{
  let disposed=false,retry:ReturnType<typeof setTimeout>|null=null,poll:ReturnType<typeof setInterval>|null=null,socket:WebSocket|null=null;const chart=chartRef.current;
  async function older(){if(disposed||loadingOlderRef.current||!hasMoreRef.current||!candlesRef.current.length)return;loadingOlderRef.current=true;setLoadingOlder(true);const visible=chart?.timeScale().getVisibleLogicalRange()??null;try{const end=candlesRef.current[0].time*1000-1;const p=await fetchCandleBlock(intervalRef.current,1000,end);if(disposed||intervalRef.current!==interval)return;const old=p.candles.filter(x=>x.time<candlesRef.current[0].time);hasMoreRef.current=p.hasMore&&old.length>0;if(!old.length)return;const map=new Map<number,Candle>();for(const x of [...old,...candlesRef.current])map.set(x.time,x);const merged=[...map.values()].sort((a,b)=>a.time-b.time);candlesRef.current=merged;setCandles(merged);applyAll(merged);if(visible)chart?.timeScale().setVisibleLogicalRange({from:visible.from+old.length,to:visible.to+old.length})}catch(e){if(!disposed)setError(e instanceof Error?e.message:"과거 차트 조회 실패")}finally{loadingOlderRef.current=false;if(!disposed)setLoadingOlder(false)}}
  const visibleHandler=(range:{from:number;to:number}|null)=>{if(range&&range.from<80)void older()};
  async function load(){setStatus("loading");setError(null);loadingOlderRef.current=false;hasMoreRef.current=true;try{const initial=await fetchMany(interval,initialTargets[interval]);if(disposed)return;if(!initial.candles.length)throw new Error("표시할 차트 데이터가 없습니다.");candlesRef.current=initial.candles;setCandles(initial.candles);hasMoreRef.current=initial.hasMore;applyAll(initial.candles);chart?.timeScale().fitContent()}catch(e){if(!disposed){setStatus("error");setError(e instanceof Error?e.message:"차트 데이터 오류")};return}connect()}
  function incoming(items:Candle[]){if(!items.length||disposed||intervalRef.current!==interval)return;const map=new Map<number,Candle>();for(const x of candlesRef.current)map.set(x.time,x);for(const x of items)map.set(x.time,x);const merged=[...map.values()].sort((a,b)=>a.time-b.time);candlesRef.current=merged;const latest=merged.at(-1);if(latest)candleSeriesRef.current?.update(toChartCandle(latest));const now=Date.now();if(now-lastUiRefreshRef.current>1000){lastUiRefreshRef.current=now;setCandles(merged);applyAll(merged)}}
  function connect(){if(disposed)return;if(interval==="1M"){setStatus("live");return}socket=new WebSocket(`wss://fstream.binance.com/market/ws/btcusdt@kline_${interval}`);socket.onopen=()=>{if(!disposed){setStatus("live");setError(null);if(poll){clearInterval(poll);poll=null}}};socket.onmessage=e=>{try{const p=JSON.parse(e.data) as KlinePayload;if(!p.k)return;incoming([{time:Math.floor(Number(p.k.t)/1000),open:Number(p.k.o),high:Number(p.k.h),low:Number(p.k.l),close:Number(p.k.c),volume:Number(p.k.v)}])}catch{}};const pollLatest=async()=>{try{const p=await fetchCandleBlock(intervalRef.current,2);incoming(p.candles);if(!socket||socket.readyState!==WebSocket.OPEN)setStatus("reconnecting")}catch{setStatus("reconnecting")}};const fallback=()=>{if(!poll){void pollLatest();poll=setInterval(pollLatest,5000)}};socket.onclose=()=>{if(!disposed){setStatus("reconnecting");fallback();retry=setTimeout(connect,3000)}};socket.onerror=()=>{fallback();socket?.close()}}
  chart?.timeScale().subscribeVisibleLogicalRangeChange(visibleHandler);void load();return()=>{disposed=true;if(retry)clearTimeout(retry);if(poll)clearInterval(poll);socket?.close();chart?.timeScale().unsubscribeVisibleLogicalRangeChange(visibleHandler)}
 },[interval]);

 useEffect(()=>{for(const r of [ema20Ref,ema50Ref,ema100Ref,ema200Ref])r.current?.applyOptions({visible:overlays.ema});for(const r of [tenkanRef,kijunRef,spanARef,spanBRef])r.current?.applyOptions({visible:overlays.ichimoku});volumeRef.current?.applyOptions({visible:overlays.volume});requestAnimationFrame(()=>drawIchimokuCloud(candlesRef.current))},[overlays]);
 useEffect(()=>{const chart=chartRef.current;if(!chart)return;const redraw=()=>requestAnimationFrame(()=>drawIchimokuCloud(candlesRef.current));chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);window.addEventListener("resize",redraw);return()=>{chart.timeScale().unsubscribeVisibleLogicalRangeChange(redraw);window.removeEventListener("resize",redraw)}},[overlays.ichimoku]);

 useEffect(()=>{
  const candle=candleSeriesRef.current;if(!candle||!selectedTrend)return;if(supportRef.current){candle.removePriceLine(supportRef.current);supportRef.current=null}if(resistanceRef.current){candle.removePriceLine(resistanceRef.current);resistanceRef.current=null}
  if(overlays.sr&&selectedTrend.support)supportRef.current=candle.createPriceLine({price:selectedTrend.support,color:"#22c55e",lineWidth:2,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:`지지 ${selectedTrend.supportStrength}/5`});
  if(overlays.sr&&selectedTrend.resistance)resistanceRef.current=candle.createPriceLine({price:selectedTrend.resistance,color:"#f59e0b",lineWidth:2,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:`저항 ${selectedTrend.resistanceStrength}/5`});
  const markers:any[]=[];if(overlays.structure){
   const majorSwings=selectedTrend.swings.filter(s=>s.label!=='H'&&s.label!=='L').slice(-6);
   for(const s of majorSwings)markers.push({time:s.time as UTCTimestamp,position:s.kind==='high'?'aboveBar':'belowBar',color:s.label==='HH'||s.label==='HL'?'#22c55e':'#ef5350',shape:s.kind==='high'?'arrowDown':'arrowUp',text:s.label});
   const majorEvents=selectedTrend.events.slice(-3);
   for(const e of majorEvents)markers.push({time:e.time as UTCTimestamp,position:e.direction==='bullish'?'belowBar':'aboveBar',color:e.type==='CHoCH'?'#a78bfa':'#38bdf8',shape:e.direction==='bullish'?'arrowUp':'arrowDown',text:`${e.type} ${e.direction==='bullish'?'↑':'↓'}`})
  }
  markerApiRef.current?.setMarkers(markers);
 },[selectedTrend,overlays.sr,overlays.structure]);

 const primary=positions[0]??null;
 useEffect(()=>{const s=candleSeriesRef.current;if(!s)return;const rm=()=>{if(entryRef.current)s.removePriceLine(entryRef.current);if(stopRef.current)s.removePriceLine(stopRef.current);if(takeRef.current)s.removePriceLine(takeRef.current);entryRef.current=stopRef.current=takeRef.current=null};rm();if(!primary)return;entryRef.current=s.createPriceLine({price:primary.entry_price,color:primary.side==='long'?"#22c55e":"#ef5350",lineWidth:2,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:"ENTRY"});stopRef.current=s.createPriceLine({price:primary.stop_loss_price,color:"#ef5350",lineWidth:2,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:"SL"});takeRef.current=s.createPriceLine({price:primary.take_profit_price,color:"#22c55e",lineWidth:2,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:"TP"});return rm},[primary]);

 const latest=candles.at(-1)??null,first=candles[Math.max(0,candles.length-96)]??null,change=latest&&first?((latest.close-first.open)/first.open)*100:null;const live=latest&&primary?calculateLivePositionMetrics(primary,latest.close):null;const pnl=latest?positions.reduce((s,p)=>s+calculateLivePositionMetrics(p,latest.close).unrealizedPnl,0):null;
 const selectedLabel=intervals.find(x=>x.value===interval)?.label??interval;
 const applyViewMode=(mode:ViewMode)=>{setViewMode(mode);if(mode==="clean")setOverlays({ema:false,ichimoku:true,structure:false,sr:true,volume:true});else if(mode==="trend")setOverlays({ema:false,ichimoku:true,structure:true,sr:true,volume:true});else setOverlays({ema:true,ichimoku:true,structure:true,sr:true,volume:true})};
 return <section className="panel live-chart-panel tradingview-chart-panel long-term-trend-panel">
  <div className="live-chart-header"><div><span className="section-kicker">BTCUSDT · 장기 추세 분석</span><div className="live-chart-price-row"><h2>{latest?money(latest.close):"BTC 장기 차트"}</h2>{change!=null?<strong className={change>=0?"paper-positive":"paper-negative"}>{signed(change)}%</strong>:null}<span className={`chart-live-state ${status}`}>{status==="live"?"● LIVE":status==="loading"?"불러오는 중":status==="reconnecting"?"재연결 중":"연결 오류"}</span></div></div><div className="chart-intervals" aria-label="차트 시간봉">{intervals.map(x=><button key={x.value} type="button" className={interval===x.value?"active":""} onClick={()=>setIntervalValue(x.value)}>{x.label}</button>)}</div></div>
  {error?<div className="chart-error">{error}</div>:null}
  <div className="trend-display-toolbar"><div className="trend-view-modes"><span>보기</span>{([['clean','간편'],['trend','추세'],['full','전체']] as [ViewMode,string][]).map(([k,t])=><button key={k} type="button" className={viewMode===k?"active":""} onClick={()=>applyViewMode(k)}>{t}</button>)}</div><details className="trend-indicator-menu"><summary>지표 설정</summary><div>{([{k:'ema',t:'EMA 20/50/100/200'},{k:'ichimoku',t:'일목균형표'},{k:'structure',t:'시장구조 / BOS·CHoCH'},{k:'sr',t:'지지·저항'},{k:'volume',t:'거래량'}] as {k:OverlayKey;t:string}[]).map(x=><button key={x.k} type="button" className={overlays[x.k]?"active":""} onClick={()=>setOverlays(v=>({...v,[x.k]:!v[x.k]}))}><i/>{x.t}</button>)}</div></details><small>{loadingOlder?"과거 캔들 추가 로딩 중…":`${candles.length.toLocaleString()}개 캔들 · 왼쪽 이동 시 자동 로드`}</small></div><div className="ichimoku-legend">{overlays.ichimoku?<><span className="tenkan">전환선 (9)</span><span className="kijun">기준선 (26)</span><span className="cloud bull">상승 구름</span><span className="cloud bear">하락 구름</span></>:null}{overlays.ema?<><span className="ema20">EMA20</span><span className="ema50">EMA50</span><span className="ema100">EMA100</span><span className="ema200">EMA200</span></>:null}</div>
  {primary&&latest&&live?<div className={`live-position-strip ${primary.side}`}><div className="live-position-main"><span className="live-position-dot"/><div><small>OPEN POSITION</small><strong>{primary.side.toUpperCase()}</strong></div></div><div><small>진입가</small><strong>{money(primary.entry_price)}</strong></div><div><small>현재가</small><strong>{money(latest.close)}</strong></div><div><small>ROI</small><strong className={live.roiPercent>=0?"paper-positive":"paper-negative"}>{signed(live.roiPercent)}%</strong></div><div><small>미실현 PnL</small><strong className={(pnl??0)>=0?"paper-positive":"paper-negative"}>{signed(pnl??live.unrealizedPnl)} USDT</strong></div></div>:null}
  <div className="long-trend-chart-stage"><div ref={containerRef} className="tradingview-chart-container long-trend-chart" aria-label={`BTCUSDT ${interval} 장기 추세 차트`}/><canvas ref={cloudCanvasRef} className="ichimoku-cloud-canvas" aria-hidden="true"/></div>
  <div className="trend-indicator-strip"><MiniSparkline label={`RSI · ${selectedLabel}`} value={(rsi.at(-1)?.value??0).toFixed(1)} values={rsi.map(x=>x.value)} guide={50}/><MiniSparkline label="ADX" value={(adx.at(-1)?.value??0).toFixed(1)} values={adx.map(x=>x.value)} guide={25}/><MiniSparkline label="ATR" value={(atr.at(-1)?.value??0).toLocaleString("en-US",{maximumFractionDigits:1})} values={atr.map(x=>x.value)}/></div>
  <div className="trend-timeframe-board"><div className="trend-overall"><small>장기 종합 추세</small><strong className={combined&&combined.score>=60?"bullish":combined&&combined.score<=40?"bearish":"neutral"}>{combined?.label??"분석 중"}</strong><b>{combined?.score??"-"} / 100</b><div><span>추세 지속도 <em>{combined?.continuation??"-"}/100</em></span><span>전환 위험 <em>{combined?.reversal??"-"}/100</em></span></div></div>{[{name:'주봉',x:contexts.w,weight:'40%'},{name:'일봉',x:contexts.d,weight:'40%'},{name:'4시간봉',x:contexts.h4,weight:'20%'}].map(v=><div className={`trend-timeframe-card ${directionClass(v.x)}`} key={v.name}><div><span>{v.name}</span><small>가중치 {v.weight}</small></div><strong>{v.x?.label??"수집 중"}</strong><b>{v.x?.score??"-"}</b><p>{v.x?.structure??"데이터 확인 중"}</p></div>)}</div>
  {combined&&selectedTrend?<div className="trend-context-summary"><strong>{combined.score>=60?'장기 추세는 상승 유지':combined.score<=40?'장기 추세는 하락 우세':'장기 추세는 전환/중립'} · 현재 {selectedLabel}은 {selectedTrend.label}</strong><span>{selectedTrend.support?`핵심 지지 ${money(selectedTrend.support)} (${pctDistance(selectedTrend.supportDistance)})`:''}{selectedTrend.resistance?` · 핵심 저항 ${money(selectedTrend.resistance)} (${pctDistance(selectedTrend.resistanceDistance)})`:''}</span></div>:null}
  {selectedTrend?<div className="trend-analysis-board trend-v2-board"><div className="trend-score"><small>현재 차트 ({selectedLabel})</small><strong>{selectedTrend.label}</strong><b>{selectedTrend.score} / 100</b></div><div className="trend-metrics"><span>시장구조 <b>{selectedTrend.structure}</b></span><span>이동평균 <b>{selectedTrend.ema}</b></span><span>일목구름 <b>{selectedTrend.ichimoku}</b></span><span>ADX <b>{selectedTrend.adx}</b></span><span>RSI <b>{selectedTrend.rsi}</b></span><span>ATR <b>{selectedTrend.atr.toLocaleString()}</b></span></div><div className="trend-levels"><span>핵심 지지 <b>{money(selectedTrend.support)} · {selectedTrend.supportStrength}/5 <em>{pctDistance(selectedTrend.supportDistance)}</em></b></span><span>핵심 저항 <b>{money(selectedTrend.resistance)} · {selectedTrend.resistanceStrength}/5 <em>{pctDistance(selectedTrend.resistanceDistance)}</em></b></span><span>신뢰도 <b>{selectedTrend.confidence}/100</b></span><span>전환 위험 <b>{selectedTrend.risk}/100</b></span></div><div className="trend-v2-status"><span><small>추세 단계</small><b>{selectedTrend.phase}</b></span><span><small>데이터 충족도</small><b>{selectedTrend.dataQuality}/100</b></span><span><small>돌파 거래량</small><b>{selectedTrend.volumeConfirmation}</b></span><span><small>다이버전스</small><b>{selectedTrend.divergence}</b></span><span><small>Major Swing</small><b>{selectedTrend.majorSwingCount}개</b></span><span><small>최근 구조 이벤트</small><b>{selectedTrend.latestStructureAgeBars==null?'없음':`${selectedTrend.latestStructureAgeBars}봉 전`}</b></span>{interval==='1w'?<span><small>주봉 안정화</small><b>{selectedTrend.weeklyStability}</b></span>:null}</div><div className="trend-contribution"><strong>점수 근거</strong>{selectedTrend.contributions.map(x=><div key={x.name}><span>{x.name}<small>{x.detail}</small></span><div><i className={x.score>=0?"pos":"neg"} style={{width:`${scoreBar(x.score,x.max)}%`}}/></div><b>{x.score>=0?'+':''}{x.score}</b></div>)}</div><div className="trend-scenarios"><strong>조건별 추세 시나리오</strong><small>현재 지표 기반 상대 강도이며 실제 적중 확률이 아닙니다.</small><div>{selectedTrend.scenarios.map(x=><article key={x.kind} className={`${x.kind} ${x.state}`}><header><b>{x.label}</b><span>{x.state==='active'?'● 활성':x.state==='invalidated'?'× 약화':'○ 대기'}</span><em>{x.strength}/100</em></header><p>{x.condition}</p><small>{x.reason}</small></article>)}</div></div><div className="trend-history"><div><strong>장기 판정 이력</strong><small>브라우저 로컬 저장 · 최근 288개</small></div>{trendHistory.length?<><div className="trend-history-stats"><span>현재 <b>{trendHistory.at(-1)?.score}/100</b></span><span>직전 대비 <b>{trendHistory.length>1?`${(trendHistory.at(-1)!.score-trendHistory.at(-2)!.score)>=0?'+':''}${trendHistory.at(-1)!.score-trendHistory.at(-2)!.score}`:'-'}</b></span><span>저장 표본 <b>{trendHistory.length}</b></span></div><div className="trend-history-row">{trendHistory.slice(-8).map(x=><i key={x.at} title={`${new Date(x.at).toLocaleString('ko-KR')} · ${x.label} ${x.score}/100`} style={{height:`${Math.max(12,x.score)}%`}}/>)}</div></>:<p>첫 장기 판정부터 자동으로 기록됩니다.</p>}</div><div className="trend-commentary"><strong>종합 분석</strong>{selectedTrend.analysis.map((v,i)=><p key={i}>{v}</p>)}<div className="trend-warning"><b>전환 위험 / 주의</b>{selectedTrend.warnings.map((v,i)=><p key={i}>{v}</p>)}</div></div></div>:null}
  <div className="chart-footnote">주봉 40% + 일봉 40% + 4시간봉 20% · Major 시장구조 + EMA + 일목균형 + ADX/DI + RSI 다이버전스 + ATR + BOS 거래량 확인 + 장기 지지·저항 · HH/HL/LH/LL 및 BOS/CHoCH 차트 표시</div>
 </section>
}
