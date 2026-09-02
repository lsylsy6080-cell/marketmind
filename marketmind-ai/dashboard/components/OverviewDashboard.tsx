import type { CSSProperties } from "react";
import { LiveBitcoinChart } from "./LiveBitcoinChart";
import { normalizeLabel } from "../format";
import type { PaperTradingData, MarketIntelligenceRow } from "../types";
import type { NewsPageData } from "../news-data";
import type { LongTermTrendSnapshot } from "../long-term-trend-data";

const num=(v:unknown)=>Number.isFinite(Number(v))?Number(v):null;
const money=(v:unknown)=>{const n=num(v);return n==null?"—":`$${n.toLocaleString("en-US",{maximumFractionDigits:2})}`};
const scoreSigned=(v:unknown)=>{const n=num(v);if(n==null)return"—";const x=(n-50)/50;return`${x>=0?"+":""}${x.toFixed(2)}`};
const tone=(v:string|null|undefined)=>String(v??"").includes("상승")||v==="bullish"?"positive":String(v??"").includes("하락")||v==="bearish"?"negative":"neutral";
const stateKo=(v:string|null|undefined)=>v==="active"?"ACTIVE":v==="invalidated"?"INVALIDATED":"WATCH";

export function OverviewDashboard({dashboard,market,news,trend,workerUpdatedAt}:{dashboard:PaperTradingData;market:MarketIntelligenceRow|null;news:NewsPageData;trend:LongTermTrendSnapshot|null;workerUpdatedAt?:string|null}){
  const decision=dashboard.decisions[0]??null;
  const plan=dashboard.decisionV2?.entry_plan??null;
  const price=dashboard.marketPrice??dashboard.funding?.mark_price??trend?.market_price??null;
  const support=trend?.current_support??plan?.secondInterestPrice??plan?.firstInterestPrice??null;
  const resistance=trend?.current_resistance??plan?.invalidationPrice??null;
  const longSupport=trend?.long_term_support??null;
  const fundingScore=decision?.funding_score??null;
  const newsScore=decision?.news_score??news.score?.weightedScore??null;
  const latestNews=news.articles.slice(0,3);
  const marketScore=market?.market_score??decision?.final_score??null;
  const confidence=decision?.final_confidence??market?.confidence??null;
  const scenarioReason=(trend?.scenario_activation_reason??{}) as Record<string,unknown>;
  const scenarios=[
    {k:"bull",label:"상승",state:trend?.bullish_scenario_state,strength:trend?.bullish_scenario_strength,reason:String(scenarioReason.bullish??"상승 구조 확인 대기")},
    {k:"neutral",label:"횡보",state:trend?.neutral_scenario_state,strength:trend?.neutral_scenario_strength,reason:String(scenarioReason.neutral??"현재 범위 유지 여부 관찰")},
    {k:"bear",label:"하락",state:trend?.bearish_scenario_state,strength:trend?.bearish_scenario_strength,reason:String(scenarioReason.bearish??"핵심 지지 이탈 여부 관찰")},
  ];
  return <section className="mock-page mock-dashboard">
    <div className="mock-kpi-grid mock-kpi-six">
      <article><span>₿ BTC 현재가</span><strong>{money(price)}</strong><small>Binance BTCUSDT</small></article>
      <article><span>◉ 최종 AI 판단</span><strong className={`tone-${tone(decision?.direction)}`}>{normalizeLabel(decision?.direction??"neutral")}</strong><small>신뢰도 {confidence==null?"—":`${Number(confidence).toFixed(0)}%`}</small></article>
      <article><span>〽 장기추세</span><strong className={`tone-${tone(trend?.combined_label)}`}>{trend?.combined_label??"수집 중"}</strong><small>강도 {trend?.combined_score??"—"}/100</small></article>
      <article><span>▤ 뉴스 점수</span><strong className={Number(newsScore??50)>=50?"paper-positive":"paper-negative"}>{scoreSigned(newsScore)}</strong><small>{news.score?.direction==="bullish"?"긍정적":news.score?.direction==="bearish"?"부정적":"중립적"}</small></article>
      <article><span>％ 펀딩 점수</span><strong>{scoreSigned(fundingScore)}</strong><small>{normalizeLabel(dashboard.funding?.risk_level??"normal")}</small></article>
      <article><span>⌁ 온체인 점수</span><strong className="mock-muted-value">—</strong><small>수집기 연결 준비</small></article>
    </div>

    <div className="mock-main-grid">
      <LiveBitcoinChart positions={dashboard.openPositions} chartOnly simple initialInterval="4h" chartHeight={370} title="BTC / USDT · 4시간 · BINANCE" />
      <div className="mock-right-stack">
        <article className="mock-panel mock-level-panel"><h2>⚙ 핵심 레벨</h2><dl>
          <div><dt>장기 지지</dt><dd>{money(longSupport)}</dd><em>장기</em></div>
          <div><dt>현재 지지</dt><dd>{money(support)}</dd><em>{trend?.current_support_source?.toUpperCase()??"—"}</em></div>
          <div><dt>현재 저항</dt><dd>{money(resistance)}</dd><em>{trend?.current_resistance_source?.toUpperCase()??"—"}</em></div>
        </dl></article>
        <article className="mock-panel mock-scenario-panel"><h2>↗ 시나리오</h2>{scenarios.map(s=><div className={`mock-scenario-row ${s.k}`} key={s.k}><i>{s.k==="bull"?"↑":s.k==="bear"?"↓":"↔"}</i><span><b>{s.label}</b><small>{s.reason}</small></span><em className={String(s.state)}>{stateKo(s.state)}</em><strong>{s.strength??"—"}</strong></div>)}</article>
      </div>
    </div>

    <div className="mock-bottom-grid four">
      <article className="mock-panel mock-trend-summary"><h2>〽 장기추세 요약</h2><strong className={`tone-${tone(trend?.combined_label)}`}>{trend?.combined_label??"분석 대기"}</strong><div className="mock-ring" style={{"--p":`${trend?.combined_score??0}%`} as CSSProperties}><b>{trend?.combined_score??"—"}</b><small>/100</small></div><p>주봉 {trend?.weekly_score??"—"} · 일봉 {trend?.daily_score??"—"} · 4시간 {trend?.four_hour_score??"—"}</p></article>
      <article className="mock-panel mock-news-list"><h2>▤ 최근 뉴스</h2>{latestNews.length?latestNews.map(a=><div key={a.id}><i className={a.sentiment}/><span>{a.title}</span><small>{a.source}</small></div>):<p>뉴스 수집 중</p>}</article>
      <article className="mock-panel mock-market-summary"><h2>◔ 시장 요약</h2><dl><div><dt>종합 점수</dt><dd>{marketScore==null?"—":Number(marketScore).toFixed(1)}</dd></div><div><dt>BTC 도미넌스</dt><dd>연동 준비</dd></div><div><dt>시장 국면</dt><dd>{normalizeLabel(decision?.market_regime??"neutral")}</dd></div><div><dt>위험 수준</dt><dd>{normalizeLabel(decision?.risk_level??"normal")}</dd></div></dl></article>
      <article className="mock-panel mock-freshness"><h2>◉ 데이터 신선도</h2><dl><div><dt>기술 지표</dt><dd>실시간</dd></div><div><dt>뉴스</dt><dd>{news.score?"정상":"대기"}</dd></div><div><dt>펀딩</dt><dd>{dashboard.funding?"정상":"대기"}</dd></div><div><dt>장기추세</dt><dd>{trend?"정상":"대기"}</dd></div><div><dt>워커</dt><dd>{workerUpdatedAt?"온라인":"확인"}</dd></div></dl></article>
    </div>
    <div className="mock-ai-tip"><img src="/marketmind-logo.svg" alt=""/><span>{decision?.decision_summary??`현재 MarketMind는 ${trend?.combined_label??"장기 구조"}와 시장 데이터를 종합해 다음 방향을 추적하고 있습니다.`}</span></div>
  </section>
}
