import type { CSSProperties } from "react";
import type { OnchainSnapshot } from "../onchain-data";

const pick=(row:OnchainSnapshot|null,...keys:string[])=>{for(const k of keys){const v=row?.[k];if(v!==undefined&&v!==null)return v}return null};
const n=(v:any)=>Number.isFinite(Number(v))?Number(v):null;
const num=(v:any,d=2)=>{const x=n(v);return x==null?"—":x.toLocaleString("en-US",{maximumFractionDigits:d})};
const signed=(v:any,suffix="")=>{const x=n(v);return x==null?"—":`${x>=0?"+":""}${num(x)}${suffix}`};
const metric=(row:OnchainSnapshot|null,...keys:string[])=>n(pick(row,...keys));

export function OnchainMockupDashboard({latest,history,connected,error}:{latest:OnchainSnapshot|null;history:OnchainSnapshot[];connected:boolean;error:string|null}){
 const score=metric(latest,"onchain_score","score");
 const netflow=metric(latest,"exchange_netflow_btc","exchange_net_flow_btc","netflow_btc");
 const etf=metric(latest,"etf_netflow_btc","etf_net_flow_btc");
 const active=metric(latest,"active_addresses","active_address_count");
 const hash=metric(latest,"hash_rate_eh","hashrate_eh","hash_rate");
 const mvrv=metric(latest,"mvrv","mvrv_zscore","mvrv_z_score");
 const sopr=metric(latest,"sopr","sopr_7d");
 const balance=metric(latest,"exchange_balance_btc","exchange_reserve_btc");
 const whale=metric(latest,"large_transfer_count","whale_transfer_count");
 const fee=metric(latest,"fee_fast","fast_fee","mempool_fee");
 const holder=String(pick(latest,"holder_state","long_term_holder_state")??(connected?"수집 중":"연동 준비"));
 const confidence=metric(latest,"onchain_confidence","confidence");
 const bars=history.slice().reverse().slice(-36);
 return <section className="mock-page mock-onchain">
  {!connected?<div className="mock-connection-note"><b>온체인 수집기 연결 전</b><span>페이지 구조는 먼저 완성했습니다. `onchain_snapshots` 데이터가 들어오면 카드와 차트가 자동으로 채워지도록 구성했습니다.</span></div>:null}
  {connected&&error?<div className="notice notice-error"><strong>온체인 데이터를 불러오지 못했습니다.</strong><span>{error}</span></div>:null}
  <div className="mock-kpi-grid mock-kpi-six">
   <article><span>⌁ 온체인 점수</span><strong className={score!=null&&score>=55?"paper-positive":score!=null&&score<=45?"paper-negative":""}>{score==null?"—":score.toFixed(2)}</strong><small>{score==null?"수집 준비":score>=55?"긍정적":score<=45?"부정적":"중립적"}</small></article>
   <article><span>↕ 거래소 순유출입 (24h)</span><strong className={(netflow??0)<=0?"paper-positive":"paper-negative"}>{signed(netflow," BTC")}</strong><small>{netflow==null?"데이터 대기":netflow<0?"순유출":"순유입"}</small></article>
   <article><span>▥ ETF 순유입 (24h)</span><strong className={(etf??0)>=0?"paper-positive":"paper-negative"}>{signed(etf," BTC")}</strong><small>ETF 흐름</small></article>
   <article><span>♙ 활성 주소 (24h)</span><strong>{num(active,0)}</strong><small>네트워크 활동</small></article>
   <article><span>⌘ 해시레이트</span><strong>{hash==null?"—":`${num(hash,1)} EH/s`}</strong><small>네트워크 보안</small></article>
   <article><span>◷ 장기 보유자 동향</span><strong className="paper-positive">{holder}</strong><small>LTH 상태</small></article>
  </div>

  <div className="mock-onchain-main">
   <article className="mock-panel mock-onchain-chart"><header><h2>온체인 종합 흐름 ⓘ</h2><div><button>24시간</button><button className="active">7일</button><button>30일</button></div></header><div className="onchain-legend"><span className="blue">● 온체인 점수</span><span className="orange">● BTC 가격</span><span className="purple">● 활성 주소</span></div><div className="onchain-lines">{bars.length?bars.map((x,i)=>{const s=metric(x,"onchain_score","score")??50;const a=metric(x,"active_addresses","active_address_count")??0;return <i key={x.id??i} style={{height:`${Math.max(8,Math.min(96,s))}%`,opacity:.55+Math.min(.4,(a%10)/25)} as CSSProperties}/>}):<span>온체인 히스토리 수집 대기</span>}</div><footer>온체인 점수는 가치평가 · 네트워크 활동 · 거래소 흐름 · 채굴/수수료 지표를 종합하도록 설계합니다.</footer></article>
   <div className="mock-onchain-side">
    <article className="mock-panel mock-onchain-signals"><h2>⚙ 핵심 온체인 신호</h2>{[
     ["거래소 순유출입",netflow,netflow!=null&&netflow<0?"강세":netflow!=null&&netflow>0?"주의":"대기"],
     ["장기 보유자",null,holder],["MVRV",mvrv,mvrv==null?"대기":mvrv<1.5?"저평가/중립":"주의"],["SOPR",sopr,sopr==null?"대기":sopr>1?"이익 실현":"손실 실현"],["활성 주소",active,active==null?"대기":"활동 확인"],["해시레이트",hash,hash==null?"대기":"네트워크 정상"]
    ].map(([label,value,state])=><div key={String(label)}><span>{label}</span><b>{value==null?"—":num(value)}</b><em>{String(state)}</em></div>)}</article>
    <article className="mock-panel mock-exchange-flow"><h2>◷ 거래소 흐름 (24h)</h2><table><thead><tr><th>구분</th><th>순유출입</th><th>판단</th></tr></thead><tbody><tr><td>전체 거래소</td><td className={(netflow??0)<=0?"paper-positive":"paper-negative"}>{signed(netflow," BTC")}</td><td>{netflow==null?"대기":netflow<0?"순유출":"순유입"}</td></tr><tr><td>대형 이동</td><td>{whale==null?"—":`${num(whale,0)}건`}</td><td>모니터링</td></tr><tr><td>수수료</td><td>{fee==null?"—":`${num(fee,1)} sat/vB`}</td><td>혼잡도</td></tr></tbody></table></article>
    <article className="mock-panel mock-holder"><h2>◔ 장기 / 단기 보유자</h2><div className="holder-gauge"><i/><b>{holder}</b></div><p>장기 보유자 공급 변화와 단기 보유자 움직임을 함께 추적할 영역입니다.</p></article>
   </div>
  </div>

  <div className="mock-onchain-cards">
   {[
    ["MVRV Z-Score",mvrv,mvrv==null?"수집 준비":mvrv<1?"저평가":mvrv>3?"과열":"중립"],
    ["SOPR (7일 평균)",sopr,sopr==null?"수집 준비":sopr>1?"이익 실현":"손실 실현"],
    ["거래소 보유량",balance,balance==null?"수집 준비":"공급 추적"],
    ["고래 이동 (24h)",whale,whale==null?"수집 준비":"대형 이동"],
    ["수수료 / 메모리풀",fee,fee==null?"수집 준비":"혼잡도"],
    ["ETF 자금 흐름",etf,etf==null?"수집 준비":etf>=0?"순유입":"순유출"]
   ].map(([label,value,state])=><article className="mock-panel" key={String(label)}><span>{label} ⓘ</span><strong>{value==null?"—":num(value)}</strong><small>{String(state)}</small><div className="tiny-spark"><i/><i/><i/><i/><i/></div></article>)}
  </div>

  <article className="mock-panel mock-onchain-ai"><div><span>온체인 종합 판단</span><strong className={score!=null&&score>=55?"paper-positive":score!=null&&score<=45?"paper-negative":""}>{score==null?"수집 준비":score>=55?"강세 (Bullish)":score<=45?"약세 (Bearish)":"중립 (Neutral)"}</strong><small>신뢰도 {confidence==null?"—":`${confidence.toFixed(0)}%`}</small></div><section><h2>AI 해석</h2><p>{score==null?"온체인 데이터 수집기가 연결되면 거래소 순유출입, 가치평가, 네트워크 활동, 해시레이트와 ETF 흐름을 종합해 장기·중기 시장 배경을 평가합니다.":`현재 온체인 종합 점수는 ${score.toFixed(1)}입니다. 거래소 흐름과 네트워크 활동을 장기추세 분석과 함께 비교해 구조적 매수·매도 압력을 판단합니다.`}</p></section><aside><h2>리스크 요인</h2><ul><li>SOPR 과열 시 단기 이익실현 위험</li><li>거래소 순유입 급증 시 매도 압력 가능성</li><li>거시경제 이벤트는 온체인과 별개로 변동성 확대 가능</li></ul></aside></article>
 </section>
}
