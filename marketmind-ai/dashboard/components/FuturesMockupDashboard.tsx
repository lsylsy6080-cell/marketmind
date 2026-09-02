import { LiveBitcoinChart } from "./LiveBitcoinChart";

const n=(v:any)=>Number.isFinite(Number(v))?Number(v):null;
const money=(v:any)=>{const x=n(v);if(x==null)return"—";const a=Math.abs(x);return a>=1e9?`$${(x/1e9).toFixed(2)}B`:a>=1e6?`$${(x/1e6).toFixed(1)}M`:`$${x.toLocaleString("en-US",{maximumFractionDigits:0})}`};
const price=(v:any)=>{const x=n(v);return x==null?"—":`$${x.toLocaleString("en-US",{maximumFractionDigits:2})}`};
const pct=(v:any,d=4)=>{const x=n(v);return x==null?"—":`${(x*100)>=0?"+":""}${(x*100).toFixed(d)}%`};
const fmt=(v:any,d=2)=>{const x=n(v);return x==null?"—":x.toFixed(d)};

export function FuturesMockupDashboard({data}:{data:any}){
 const a=data.aggregate??{}, liq=data.liquidation??{}, sq=data.squeeze??{}, warn=data.warning??{};
 const exchanges=(data.exchanges??[]) as any[];
 const current=n(liq.current_price??sq.current_price??exchanges[0]?.last_price);
 const oi=n(a.total_open_interest_usd);
 const turnover=n(a.total_turnover_24h_usd);
 const funding=n(a.weighted_funding_rate);
 const buyRatio=n(a.global_taker_buy_ratio);
 const longP=n(sq.long_squeeze_probability??sq.long_squeeze?.probability);
 const shortP=n(sq.short_squeeze_probability??sq.short_squeeze?.probability);
 const longZone=liq.nearest_long_zone??{}; const shortZone=liq.nearest_short_zone??{};
 const center=(z:any)=>n(z.centerPrice??z.center_price);
 const maxPressure=Math.max(longP??0,shortP??0);
 return <section className="mock-page mock-futures">
   {data.error?<div className="notice notice-error"><strong>선물 데이터를 불러오지 못했습니다.</strong><span>{data.error}</span></div>:null}
   <div className="mock-kpi-grid mock-kpi-six">
    <article><span>₿ 현재가</span><strong>{price(current)}</strong><small>BTCUSDT</small></article>
    <article><span>◉ 펀딩비 (8시간)</span><strong className={(funding??0)>=0?"paper-positive":"paper-negative"}>{pct(funding)}</strong><small>{(funding??0)>=0?"롱 우위":"숏 우위"}</small></article>
    <article><span>▧ 미결제약정 (OI)</span><strong>{money(oi)}</strong><small>{a.healthy_exchange_count??"—"}개 거래소 합산</small></article>
    <article><span>↔ 롱 / 숏 비율</span><strong>{buyRatio==null?"—":fmt(buyRatio/(Math.max(.001,1-buyRatio)),2)}</strong><small>{buyRatio==null?"수집 중":`매수 ${(buyRatio*100).toFixed(1)}%`}</small></article>
    <article><span>⚡ 청산 압력 (24H)</span><strong className={maxPressure>=60?"paper-negative":""}>{maxPressure?`${maxPressure.toFixed(0)}/100`:"—"}</strong><small>{maxPressure>=60?"높음":"보통"}</small></article>
    <article><span>▤ 거래량 (24H)</span><strong>{money(turnover)}</strong><small>선물 거래대금</small></article>
   </div>

   <div className="mock-main-grid mock-futures-main">
    <LiveBitcoinChart chartOnly simple initialInterval="1h" chartHeight={405} title="BTCUSDT 무기한 · 1시간 · BINANCE" />
    <div className="mock-right-stack">
      <article className="mock-panel mock-futures-core"><h2>선물 핵심 지표</h2><dl>
        <div><dt>펀딩비 (8시간)</dt><dd>{pct(funding)}</dd><em>{warn.short_phase??"—"}</em></div>
        <div><dt>미결제약정</dt><dd>{money(oi)}</dd><em>OI</em></div>
        <div><dt>테이커 매수비율</dt><dd>{buyRatio==null?"—":`${(buyRatio*100).toFixed(1)}%`}</dd><em>{buyRatio!=null&&buyRatio>.5?"매수 우위":"매도 우위"}</em></div>
        <div><dt>예상 롱 청산 구간</dt><dd>{price(center(longZone))}</dd><em>{warn.long_phase??"WATCH"}</em></div>
        <div><dt>예상 숏 청산 구간</dt><dd>{price(center(shortZone))}</dd><em>{warn.short_phase??"WATCH"}</em></div>
      </dl></article>
      <div className="mock-futures-sidegrid">
        <article className="mock-panel mock-liquidation"><h2>청산 히트맵 요약</h2><div className="liquid-bar"><i style={{width:`${Math.max(5,longP??0)}%`}}/><b style={{width:`${Math.max(5,shortP??0)}%`}}/></div><p><span>롱 청산 {longP==null?"—":`${longP.toFixed(0)}%`}</span><span>숏 청산 {shortP==null?"—":`${shortP.toFixed(0)}%`}</span></p><small>가장 가까운 예상 청산대 기준</small></article>
        <article className="mock-panel mock-scenario-mini"><h2>시나리오</h2><div><b className="up">↑ 상승</b><span>{shortP!=null&&shortP>longP! ? "ACTIVE":"WATCH"}</span></div><div><b>↔ 횡보</b><span>WATCH</span></div><div><b className="down">↓ 하락</b><span>{longP!=null&&longP>shortP! ? "ACTIVE":"WATCH"}</span></div></article>
      </div>
    </div>
   </div>

   <div className="mock-bottom-grid four">
    <article className="mock-panel mock-derivative-summary"><h2>파생 요약</h2><dl><div><dt>총 OI</dt><dd>{money(oi)}</dd></div><div><dt>24시간 거래량</dt><dd>{money(turnover)}</dd></div><div><dt>Funding</dt><dd>{pct(funding)}</dd></div><div><dt>거래소 커버리지</dt><dd>{a.healthy_exchange_count??exchanges.length} / {a.exchange_count??5}</dd></div></dl></article>
    <article className="mock-panel mock-funding-history"><h2>최근 펀딩 변화</h2>{exchanges.slice(0,5).map((x:any)=><div key={x.exchange}><span>{String(x.exchange).toUpperCase()}</span><b className={(n(x.funding_rate)??0)>=0?"paper-positive":"paper-negative"}>{pct(x.funding_rate)}</b></div>)}</article>
    <article className="mock-panel mock-position-donut"><h2>롱 / 숏 포지션 분포</h2><div className="mock-donut" style={{background:`conic-gradient(#26c981 0 ${(buyRatio??.5)*100}%, #ef5350 ${(buyRatio??.5)*100}% 100%)`}}><span><b>{buyRatio==null?"—":`${(buyRatio*100).toFixed(1)}%`}</b><small>롱</small></span></div><p>테이커 흐름 기반 참고 비율</p></article>
    <article className="mock-panel mock-freshness"><h2>데이터 신선도</h2>{exchanges.slice(0,5).map((x:any)=><dl key={x.exchange}><div><dt>{String(x.exchange).toUpperCase()}</dt><dd>{x.available===false?"오류":"실시간"}</dd></div></dl>)}</article>
   </div>
   <div className="mock-ai-tip"><img src="/marketmind-logo.svg" alt=""/><span>선물 페이지는 OI · Funding · Taker Flow · 예상 청산 구간을 한 화면에 모아 과열과 스퀴즈 위험을 빠르게 확인하도록 정리했습니다.</span></div>
 </section>
}
