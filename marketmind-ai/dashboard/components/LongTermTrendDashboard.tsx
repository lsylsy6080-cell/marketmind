import type { CSSProperties } from "react";
import { LiveBitcoinChart } from "./LiveBitcoinChart";
import type { LongTermTrendSnapshot } from "../long-term-trend-data";

const money=(v:number|null|undefined)=>v==null?"—":`$${v.toLocaleString("en-US",{maximumFractionDigits:2})}`;
const tone=(v:string|null|undefined)=>String(v??"").includes("상승")?"positive":String(v??"").includes("하락")?"negative":"neutral";
const stateKo=(v:string|null|undefined)=>v==="active"?"ACTIVE":v==="invalidated"?"INVALIDATED":"WATCH";

export function LongTermTrendDashboard({latest,history,error}:{latest:LongTermTrendSnapshot|null;history:LongTermTrendSnapshot[];error:string|null}){
 const reasons=(latest?.scenario_activation_reason??{}) as Record<string,unknown>;
 const scenarios=[
  {k:"bull",title:"상승 지속 시나리오",state:latest?.bullish_scenario_state,strength:latest?.bullish_scenario_strength,range:latest?.current_resistance?`${money(latest.current_resistance)} 돌파 시 추가 상승 확인`:"저항 돌파 확인 대기",reason:String(reasons.bullish??"상승 구조 확인 대기")},
  {k:"neutral",title:"횡보/조정 시나리오",state:latest?.neutral_scenario_state,strength:latest?.neutral_scenario_strength,range:latest?.current_support&&latest.current_resistance?`${money(latest.current_support)} ~ ${money(latest.current_resistance)}`:"범위 계산 중",reason:String(reasons.neutral??"횡보 범위 확인 대기")},
  {k:"bear",title:"하락 전환 시나리오",state:latest?.bearish_scenario_state,strength:latest?.bearish_scenario_strength,range:latest?.current_support?`${money(latest.current_support)} 이탈 시 위험 확대`:"지지 이탈 확인 대기",reason:String(reasons.bearish??"하락 구조 확인 대기")},
 ];
 const bars=history.slice().reverse().slice(-28);
 return <section className="mock-page mock-trend-page">
  {error?<div className="notice notice-error"><strong>장기추세 DB 스냅샷을 불러오지 못했습니다.</strong><span>{error}</span></div>:null}
  <div className="mock-trend-layout">
   <div className="trend-chart-column">
    <LiveBitcoinChart chartOnly initialInterval="1d" chartHeight={470} title="BTC / USDT · 장기 추세 · BINANCE" />
   </div>
   <div className="mock-trend-side">
    <div className="trend-card-grid">
      <article><span>장기 종합 추세</span><strong className={`tone-${tone(latest?.combined_label)}`}>{latest?.combined_label??"분석 대기"}</strong><small>추세 강도 {latest?.combined_score??"—"}/100</small></article>
      <article><span>주봉</span><strong className={`tone-${tone(latest?.weekly_label)}`}>{latest?.weekly_label??"—"}</strong><small>{latest?.weekly_score??"—"}/100</small></article>
      <article><span>일봉</span><strong className={`tone-${tone(latest?.daily_label)}`}>{latest?.daily_label??"—"}</strong><small>{latest?.daily_score??"—"}/100</small></article>
      <article><span>4시간봉</span><strong className={`tone-${tone(latest?.four_hour_label)}`}>{latest?.four_hour_label??"—"}</strong><small>{latest?.four_hour_score??"—"}/100</small></article>
      <article><span>신뢰도</span><strong className="mock-blue">{latest?.combined_confidence??"—"}/100</strong><small>다중 시간봉 합의</small></article>
      <article><span>전환 경고도</span><strong className="mock-warning">{latest?.combined_risk??"—"}/100</strong><small>구조 변화 위험</small></article>
    </div>
    <article className="mock-panel mock-trend-levels"><h2>핵심 레벨</h2><dl><div><dt>장기 지지</dt><dd>{money(latest?.long_term_support)}</dd></div><div><dt>현재 지지</dt><dd>{money(latest?.current_support)}</dd><em>{latest?.current_support_source?.toUpperCase()??"—"}</em></div><div><dt>현재 저항</dt><dd>{money(latest?.current_resistance)}</dd><em>{latest?.current_resistance_source?.toUpperCase()??"—"}</em></div></dl></article>
   </div>
  </div>

  <div className="mock-trend-bottom">
   <article className="mock-panel mock-score-basis"><h2>점수 근거</h2>{[
    ["주봉 구조",latest?.weekly_score,40],["일봉 구조",latest?.daily_score,40],["4시간 구조",latest?.four_hour_score,20],["신뢰도",latest?.combined_confidence,100],["추세 지속도",latest?.trend_continuation,100]
   ].map(([label,value,max])=><div key={String(label)}><span>{label}</span><i><b style={{width:`${Math.max(0,Math.min(100,Number(value??0)/Number(max)*100))}%`}}/></i><strong>{value??"—"}/{max}</strong></div>)}<footer>총점 <b>{latest?.combined_score??"—"}/100</b></footer></article>
   <article className="mock-panel mock-trend-scenarios"><h2>조건별 추세 시나리오</h2>{scenarios.map(s=><div className={`trend-scenario-line ${s.k}`} key={s.k}><i>{s.k==="bull"?"↑":s.k==="bear"?"↓":"↔"}</i><span><b>{s.title} <em className={String(s.state)}>{stateKo(s.state)}</em></b><small>{s.range}</small><p>{s.reason}</p></span><strong>{s.strength??"—"}</strong></div>)}</article>
   <article className="mock-panel mock-trend-analysis"><h2>종합 분석</h2><p>현재 장기 종합 추세는 <b className={`tone-${tone(latest?.combined_label)}`}>{latest?.combined_label??"분석 대기"}</b>입니다. 주봉은 {latest?.weekly_label??"—"}, 일봉은 {latest?.daily_label??"—"}, 4시간봉은 {latest?.four_hour_label??"—"}으로 평가되고 있습니다.</p><p>현재 판단 기준 지지는 <b>{money(latest?.current_support)}</b>, 저항은 <b>{money(latest?.current_resistance)}</b>이며 장기 구조 지지는 <b>{money(latest?.long_term_support)}</b>로 분리해 추적합니다.</p><div><span>핵심 전략</span><b>{latest?.bullish_scenario_state==="active"?"상승 구조 유지 중 · 저항 돌파 여부 확인":latest?.bearish_scenario_state==="active"?"하락 구조 활성 · 지지 이탈 위험 관리":"지지·저항 범위 내 방향 확인 대기"}</b></div></article>
  </div>

  <article className="mock-panel mock-trend-history-db"><header><h2>장기 판정 히스토리</h2><small>{latest?.engine_version??"엔진 버전 대기"}</small></header><div className="history-bars">{bars.length?bars.map(x=><i key={x.id} title={`${x.snapshot_hour} · ${x.combined_label} ${x.combined_score}/100`} style={{height:`${Math.max(8,x.combined_score??0)}%`} as CSSProperties}/>):<span>데이터가 쌓이면 시간별 추세 변화가 표시됩니다.</span>}</div></article>
  <div className="mock-ai-tip"><img src="/marketmind-logo.svg" alt=""/><span>장기 추세는 주봉 40% + 일봉 40% + 4시간봉 20%를 기준으로 구조·추세·지지저항을 종합하며, 동일 엔진 버전의 스냅샷을 계속 축적해 성능을 검증합니다.</span></div>
 </section>
}
