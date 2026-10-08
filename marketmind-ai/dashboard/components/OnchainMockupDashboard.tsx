'use client';
import { useState } from 'react';
import type { OnchainSnapshot, OnchainMetric, OnchainHistorySnapshot } from '../onchain-data';
import styles from './OnchainDashboard.module.css';
const format = (n:number|null|undefined, digits=2) => n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-US',{maximumFractionDigits:digits});
const date = (s:string) => new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
const names:Record<string,string> = {active_addresses:'활성 주소',transactions_24h:'일간 거래 수',mvrv:'MVRV',hash_rate_eh:'해시레이트',exchange_inflow_btc:'거래소 유입',exchange_outflow_btc:'거래소 유출',exchange_balance_btc:'거래소 보유량',exchange_netflow_btc:'거래소 순유입',fee_fast:'우선 수수료',fee_hour:'1시간 수수료',mempool_tx_count:'미확정 거래',mempool_vsize:'메모리풀 크기',circulating_supply_btc:'유통 공급량',difficulty:'채굴 난이도',difficulty_change_pct:'예상 난이도 변화',market_cap_usd:'시가총액',active_addresses_change_7d_pct:'활성 주소 평균 변화',bc_issuance_btc:'일간 발행량'};
function MetricCard({label,metric}:{label:string;metric:OnchainMetric|undefined}) {
  return <article className={styles.card}><span>{label}</span><strong>{format(metric?.value)} <small>{metric?.unit}</small></strong><footer>{metric ? `${metric.source} · ${date(metric.observed_at)} 기준`:'수집 대기'}</footer></article>;
}
export function OnchainMockupDashboard({latest,history,connected,error}:{latest:OnchainSnapshot|null;history:OnchainHistorySnapshot[];connected:boolean;error:string|null}) {
  const [range,setRange] = useState(7);
  const [view,setView] = useState('score');
  const metrics = latest?.metrics ?? {};
  const anchor = latest ? Date.parse(latest.calculated_at) : 0;
  const rows = history.slice().reverse().filter(r=>Date.parse(r.snapshot_hour) >= anchor-range*86400_000);
  let points = rows.map(r=>({time:r.snapshot_hour,value:view==='score'?r.onchain_score:r.metrics[view]?.value??null}));
  // Daily provider history is retained at collection time; use it for actual daily comparisons.
  if (view==='active_addresses') {
    const raw = latest?.raw_data.coinmetrics as {days?:{time:string;AdrActCnt:string|null}[]}|undefined;
    points = (raw?.days??[]).filter(r=>Date.parse(r.time)>=anchor-range*86400_000).map(r=>({time:r.time,value:r.AdrActCnt==null?null:Number(r.AdrActCnt)}));
  }
  const valid=points.filter((p):p is {time:string;value:number}=>p.value!==null&&Number.isFinite(p.value));
  const low=Math.min(...valid.map(p=>p.value)),high=Math.max(...valid.map(p=>p.value));
  const start=valid.length?Date.parse(valid[0].time):0,end=valid.length?Date.parse(valid.at(-1)!.time):0;
  const x=(t:string)=>34+(Date.parse(t)-start)/Math.max(1,end-start)*732;
  const y=(v:number)=>180-(v-low)/Math.max(1,high-low)*145;
  const segments:string[]=[];let current='';
  for(const p of points){if(p.value===null||!Number.isFinite(p.value)){if(current)segments.push(current);current='';}else current+=`${current?' L':'M'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`;}if(current)segments.push(current);
  const completed = Object.values(latest?.sources??{}).filter(s=>s.ok).length;
  return <section className={styles.page}>
    <header className={styles.header}><div><span className={styles.kicker}>BITCOIN / ONCHAIN INTELLIGENCE</span><h2>네트워크의 움직임을 읽다</h2><p>공개 온체인 지표 · 원본 보존 · 시간당 자동 갱신</p></div><span className={styles.badge}>{latest?`${completed}/${Object.keys(latest.sources).length} 요청 정상`:'수집 대기'}</span></header>
    {error?<div role="alert" className={styles.notice}>온체인 조회 실패: {error}</div>:!latest?<div className={styles.notice}>{connected?'첫 온체인 수집을 기다리고 있습니다.':'온체인 저장소 연결 대기'}</div>:null}
    <div className={styles.kpis}><article className={styles.card}><span>온체인 배경 점수</span><strong>{format(latest?.onchain_score,1)} <small>/ 100</small></strong><footer>데이터 충족도 {latest?.onchain_confidence??0}% · 휴리스틱 분석</footer></article>{['active_addresses','transactions_24h','hash_rate_eh','mvrv','exchange_netflow_btc'].map(key=><MetricCard key={key} label={names[key]} metric={metrics[key]}/>)}</div>
    <div className={styles.main}><article className={styles.panel}><header className={styles.chartHeader}><h3>온체인 추이</h3><div>{[1,7,30].map(d=><button key={d} aria-pressed={range===d} onClick={()=>setRange(d)}>{d===1?'24시간':`${d}일`}</button>)}</div></header><div className={styles.legend}>{[['score','종합 점수'],['active_addresses','활성 주소'],['hash_rate_eh','해시레이트']].map(([key,label])=><button key={key} aria-pressed={view===key} onClick={()=>setView(key)}>{label}</button>)}</div>
    {valid.length>=2?<><svg className={styles.chart} viewBox="0 0 800 230" role="img" aria-label={`${view==='score'?'종합 점수':names[view]} ${range}일 추이`}>{[35,107,180].map((yy,i)=><g key={yy}><line x1="34" x2="766" y1={yy} y2={yy} stroke="#263747"/><text x="34" y={yy-6} fill="#92a3b8" fontSize="11">{format(high-(high-low)*i/2,1)}</text></g>)}{segments.map((path,i)=><path key={i} d={path} fill="none" stroke="#69b9e9" strokeWidth="2.5"/>)}<text x="34" y="216" fill="#92a3b8" fontSize="11">{date(valid[0].time)}</text><text x="766" y="216" textAnchor="end" fill="#92a3b8" fontSize="11">{date(valid.at(-1)!.time)}</text></svg><p className={styles.footnote}>{valid.length}개 실제 관측값 · 누락 구간은 연결하지 않습니다.</p></>:<div className={styles.empty}>추이 표시에는 관측값이 2개 이상 필요합니다. 활성 주소는 공개 일간 이력을 확인할 수 있습니다.</div>}
    <p className={styles.footnote}>일간 지표는 완료된 공급자 관측을 사용합니다. 점수는 시장 배경의 참고 지표이며 수익 확률이 아닙니다.</p></article>
    <article className={styles.panel}><h3>분석 근거</h3>{latest?.signals.map(s=><div className={styles.signal} key={s.key}><header><b>{s.label}</b><strong>{format(s.score,1)}</strong></header><p>{s.reason}</p></div>)}<p className={styles.footnote}>가치평가 · 거래소 흐름 · 네트워크 활동을 동일 비중으로 비교합니다. 해시레이트와 수수료는 매수·매도 점수에 직접 사용하지 않습니다.</p></article></div>
    <div className={styles.detailsGrid}><article className={styles.panel}><h3>수집 소스</h3><div className={styles.sourceList}>{Object.entries(latest?.sources??{}).map(([key,s])=><div className={styles.source} key={key}><div><b>{key.replace('mempool_','mempool.space / ')}</b><small>{s.ok?`${s.metric_count}개 원본·파생 지표`:s.error}</small></div><span className={s.ok?styles.ok:styles.warn}>{s.ok?'응답 정상':'조회 실패'}</span></div>)}</div>{latest?<p className={styles.footnote}>마지막 수집 {date(latest.calculated_at)} KST · 응답 성공과 개별 지표의 최신성은 별개입니다.</p>:null}</article><article className={styles.panel}><h3>데이터 범위</h3><p>Coin Metrics Community의 BTC 일간 공개 카탈로그 전체와 Blockchain.com 네트워크 통계, mempool.space 수수료·메모리풀·채굴 지표를 보존합니다.</p><p>거래소 흐름은 공급자가 식별한 주소 범위이며 전체 거래소의 확정 유출입이 아닙니다. MVRV는 Z-Score와 구분합니다.</p><p className={styles.footnote}>SOPR, 장기·단기 보유자 분류, 고래 라벨, ETF 흐름은 현재 검증한 무료 온체인 소스에 없어 생성하지 않습니다. ETF는 별도 금융 데이터입니다.</p></article></div>
    <details className={styles.panel}><summary>수집 지표 전체 보기 · {Object.keys(metrics).length}개</summary><div className={styles.tableWrap}><table><thead><tr><th>지표</th><th>값</th><th>단위</th><th>출처</th><th>기준 시각 (KST)</th><th>상태</th></tr></thead><tbody>{Object.entries(metrics).map(([key,m])=><tr key={key}><td>{names[key]??key}</td><td>{format(m.value,4)}</td><td>{m.unit}</td><td>{m.source}</td><td>{date(m.observed_at)}</td><td>{m.value===null?"미제공 / 유효값 없음":anchor-Date.parse(m.observed_at)>72*3600000?"지연":"관측값"}</td></tr>)}</tbody></table></div></details>
  </section>;
}
