"use client";

import { useLiveBtcPrice } from "../hooks/useLiveBtcPrice";
type R=Record<string,any>;
const n=(v:any)=>Number.isFinite(Number(v))?Number(v):null;
const money=(v:any)=>{const x=n(v);if(x===null)return"—";const a=Math.abs(x);return a>=1e9?`$${(x/1e9).toFixed(2)}B`:a>=1e6?`$${(x/1e6).toFixed(1)}M`:`$${x.toLocaleString(undefined,{maximumFractionDigits:0})}`};
const price=(v:any)=>{const x=n(v);return x===null?"—":`${x.toLocaleString(undefined,{maximumFractionDigits:1})}`};
const pct=(v:any,d=2)=>{const x=n(v);return x===null?"—":`${(x*100).toFixed(d)}%`};
const o=(v:any):R=>v&&typeof v==='object'?v:{};
const range=(z:R)=>{const lo=n(z.priceLow??z.price_low),hi=n(z.priceHigh??z.price_high);return lo!==null&&hi!==null?`${lo.toLocaleString()} ~ ${hi.toLocaleString()}`:"—"};
const center=(z:R)=>n(z.centerPrice??z.center_price);
const phaseClass=(v:string)=>['ACTIVE','IMMINENT'].includes(v)?'danger':v==='BUILDING'?'warn':'ok';
const level=(p:number|null)=>p===null?'—':p>=70?'HIGH':p>=50?'ELEVATED':p>=30?'WATCH':'LOW';
const exchangeOrder=['binance','okx','bybit','gate','mexc'];
const exchangeMeta:Record<string,{name:string;logo:string}>={
 binance:{name:'Binance',logo:'/exchanges/binance.svg'},
 okx:{name:'OKX',logo:'/exchanges/okx.svg'},
 bybit:{name:'Bybit',logo:'/exchanges/bybit.svg'},
 gate:{name:'Gate.io',logo:'/exchanges/gate.svg'},
 mexc:{name:'MEXC',logo:'/exchanges/mexc.svg'},
};
function FlowBar({ratio}:{ratio:number|null}){const buy=ratio==null?null:Math.max(0,Math.min(1,ratio));return <div className="gf-flow">{buy==null?<span className="gf-muted">—</span>:<><b>{(buy*100).toFixed(0)}%</b><div><i className="buy" style={{width:`${buy*100}%`}}/><i className="sell" style={{width:`${(1-buy)*100}%`}}/></div><strong>{((1-buy)*100).toFixed(0)}%</strong></>}</div>}
function RiskMeter({value,tone}:{value:number|null;tone:'long'|'short'}){const v=Math.max(0,Math.min(100,value??0));return <div className={`gf-risk-meter ${tone}`}><i style={{width:`${v}%`}}/><span>{value==null?'—':`${Math.round(value)} / 100`}</span></div>}
export function GlobalFuturesDashboard({data}:{data:any}){
 const a=o(data.aggregate),liq=o(data.liquidation),sq=o(data.squeeze),w=o(data.warning);
 const longZone=o(liq.nearest_long_zone),shortZone=o(liq.nearest_short_zone),strongLong=o(liq.strongest_long_zone),strongShort=o(liq.strongest_short_zone);
 const longSq=o(sq.long_squeeze),shortSq=o(sq.short_squeeze);
 const snapshotCurrent=n(liq.current_price??sq.current_price??data.exchanges?.[0]?.last_price);
 const {price:liveCurrent,status:liveStatus}=useLiveBtcPrice(snapshotCurrent);
 const current=liveCurrent??snapshotCurrent;
 const longPhase=String(w.long_phase??'WATCH'),shortPhase=String(w.short_phase??'WATCH');
 const longTrigger=center(longZone),shortTrigger=center(shortZone);
 const longProb=n(sq.long_squeeze_probability??longSq.probability),shortProb=n(sq.short_squeeze_probability??shortSq.probability);
 const longIntensity=n(longZone.intensity??longSq.nearestZoneIntensity),shortIntensity=n(shortZone.intensity??shortSq.nearestZoneIntensity);
 const dist=(p:number|null)=>p!==null&&current?((p-current)/current*100):null;
 const sortedExchanges=[...(data.exchanges??[])].sort((x:any,y:any)=>exchangeOrder.indexOf(String(x.exchange))-exchangeOrder.indexOf(String(y.exchange)));
 return <>
  {data.error?<section className="notice notice-error"><strong>글로벌 선물 데이터를 불러오지 못했습니다.</strong><span>{data.error}</span></section>:null}
  <section className="gf-heading">
   <div><span className="section-kicker">GLOBAL FUTURES INTELLIGENCE</span><h1>글로벌 선물 시장</h1><p>5개 주요 거래소 선물 데이터를 종합한 시장 압력 · 스퀴즈 분석</p></div>
   <div className="gf-current"><span>BTCUSDT</span><strong>{price(current)} <small>USDT</small></strong><em className={`gf-live-price ${liveStatus}`}>{liveStatus==='live'?'● 실시간 Binance Futures':liveStatus==='reconnecting'?'● 재연결 중':'● 연결 중'}</em></div>
  </section>

  <section className="gf-kpis">
   <article><span>24H 선물 거래대금</span><strong>{money(a.total_turnover_24h_usd)}</strong><small>{a.healthy_exchange_count??'—'} / {a.exchange_count??5} 거래소 정상</small></article>
   <article><span>Open Interest</span><strong>{money(a.total_open_interest_usd)}</strong><small>{a.healthy_exchange_count??'—'} / {a.exchange_count??5} 거래소 합산</small></article>
   <article><span>가중 Funding Rate</span><strong>{pct(a.weighted_funding_rate,4)}</strong><small>Funding crowding reference</small></article>
   <article className="gf-kpi-flow"><span>Taker Buy / Sell</span><FlowBar ratio={n(a.global_taker_buy_ratio)}/><small>Coverage {n(a.taker_source_coverage_percent)?.toFixed(0)??'—'}% ({a.taker_source_count??'—'} / {a.exchange_count??5})</small></article>
  </section>

  <section className="gf-panel gf-squeeze-panel">
   <div className="gf-panel-title"><div><span>SQUEEZE FORECAST</span><h2>스퀴즈 예상 가격대</h2></div><small>Position Cluster · OI · Liquidation · Taker Flow</small></div>
   <div className="gf-squeeze-grid-v2">
    <article className="gf-squeeze-card long"><header><div><span>▼ LONG SQUEEZE</span><b>하락 연쇄청산 위험</b></div><span className={`gf-status ${phaseClass(longPhase)}`}>{longPhase}</span></header><p>예상 발동가</p><div className="gf-trigger"><h3>{price(longTrigger)} <small>USDT</small></h3><b>{dist(longTrigger)==null?'—':`${dist(longTrigger)!.toFixed(2)}%`}</b></div><div className="gf-zone"><span>예상 구간</span><strong>{range(longZone)}</strong></div><dl><div><dt>발동 확률</dt><dd>{longProb==null?'—':`${longProb.toFixed(0)}%`} <em>{level(longProb)}</em></dd></div><div><dt>단계</dt><dd>{longPhase}</dd></div><div className="meter-row"><dt>청산 강도</dt><dd><RiskMeter value={longIntensity} tone="long"/></dd></div></dl><footer><span>가장 강한 롱 청산 구간</span><strong>{range(strongLong)}</strong></footer></article>
    <div className="gf-center-price"><span>현재가</span><strong>{price(current)}</strong><small>USDT</small><i/></div>
    <article className="gf-squeeze-card short"><header><div><span>SHORT SQUEEZE ▲</span><b>상승 연쇄청산 위험</b></div><span className={`gf-status ${phaseClass(shortPhase)}`}>{shortPhase}</span></header><p>예상 발동가</p><div className="gf-trigger"><h3>{price(shortTrigger)} <small>USDT</small></h3><b>{dist(shortTrigger)==null?'—':`${dist(shortTrigger)!>=0?'+':''}${dist(shortTrigger)!.toFixed(2)}%`}</b></div><div className="gf-zone"><span>예상 구간</span><strong>{range(shortZone)}</strong></div><dl><div><dt>발동 확률</dt><dd>{shortProb==null?'—':`${shortProb.toFixed(0)}%`} <em>{level(shortProb)}</em></dd></div><div><dt>단계</dt><dd>{shortPhase}</dd></div><div className="meter-row"><dt>청산 강도</dt><dd><RiskMeter value={shortIntensity} tone="short"/></dd></div></dl><footer><span>가장 강한 숏 청산 구간</span><strong>{range(strongShort)}</strong></footer></article>
   </div>
   <div className="gf-caution">스퀴즈 가격은 실제 포지션 원장이 아닌 Position Cluster · Open Interest · Funding · 실제 Liquidation을 바탕으로 계산한 추정치입니다.</div>
  </section>

  <section className="gf-panel gf-exchange-panel gf-exchange-panel-wide">
   <div className="gf-panel-title">
    <div><span>EXCHANGE FLOW</span><h2>거래소별 핵심 선물 흐름</h2></div>
    <small>현재 시장 비교에 필요한 OI · Funding · Taker Flow만 표시</small>
   </div>
   <div className="gf-table-wrap">
    <table className="gf-table">
     <thead><tr><th>거래소</th><th>현재가</th><th>Open Interest</th><th>Funding</th><th>Taker Buy / Sell</th></tr></thead>
     <tbody>{sortedExchanges.map((x:any)=>{const key=String(x.exchange).toLowerCase(),meta=exchangeMeta[key]??{name:key.toUpperCase(),logo:''};return <tr key={key}><td><div className="gf-exchange"><span className={`gf-logo ${key}`}>{meta.logo?<img src={meta.logo} alt=""/>:null}</span><b>{meta.name}</b></div></td><td>{price(x.last_price)}</td><td>{money(x.open_interest_usd)}</td><td className="gf-funding">{pct(x.funding_rate,4)}</td><td><FlowBar ratio={n(x.taker_buy_ratio)}/></td></tr>})}</tbody>
    </table>
   </div>
  </section>
 </>;
}
