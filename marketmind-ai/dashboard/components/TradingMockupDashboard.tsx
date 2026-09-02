import type { CSSProperties } from "react";
import { LiveBitcoinChart } from "./LiveBitcoinChart";
import type { PaperTradingData } from "../types";
import { calculateLivePositionMetrics } from "../live-position";
import { normalizeLabel } from "../format";

const money=(v:number|null|undefined,d=2)=>v==null||!Number.isFinite(Number(v))?"—":`$${Number(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})}`;
const pct=(v:number|null|undefined,d=2)=>v==null||!Number.isFinite(Number(v))?"—":`${Number(v)>=0?"+":""}${Number(v).toFixed(d)}%`;

export function TradingMockupDashboard({data}:{data:PaperTradingData}){
 const p=data.openPositions[0]??null;
 const price=data.marketPrice??data.funding?.mark_price??p?.entry_price??null;
 const live=p&&price?calculateLivePositionMetrics(p,price):null;
 const total=(data.account?.cash_balance??0)+(p&&live?live.unrealizedPnl:0);
 const realized=data.account?.realized_pnl??0;
 const totalTrades=data.trades.length;
 const wins=data.trades.filter(t=>t.net_pnl>0).length;
 const winRate=totalTrades?wins/totalTrades*100:(data.performanceSummary.directionAccuracy??0);
 const today=data.trades.filter(t=>new Date(t.closed_at).toDateString()===new Date().toDateString()).reduce((s,t)=>s+t.net_pnl,0);
 const pf=data.strategyPerformance?.profit_factor??null;
 const risk=p&&price?Math.abs((p.stop_loss_price-price)/price*100):null;
 const rr=p&&price&&p.stop_loss_price!==price?Math.abs((p.take_profit_price-price)/(price-p.stop_loss_price)):null;
 const recent=data.trades.slice(0,5);
 return <section className="mock-page mock-trading">
  {data.error?<div className="notice notice-error"><strong>모의매매 데이터를 불러오지 못했습니다.</strong><span>{data.error}</span></div>:null}
  <div className="mock-kpi-grid mock-kpi-six">
   <article><span>▣ 총 자산</span><strong>{money(total)}</strong><small>현금 + 미실현 손익</small></article>
   <article><span>↗ 실현 손익</span><strong className={realized>=0?"paper-positive":"paper-negative"}>{money(realized)}</strong><small>{pct(data.strategyPerformance?.average_return_percent)}</small></article>
   <article><span>◔ 미실현 손익</span><strong className={(live?.unrealizedPnl??0)>=0?"paper-positive":"paper-negative"}>{money(live?.unrealizedPnl??0)}</strong><small>{pct(live?.roiPercent)}</small></article>
   <article><span>◎ 승률</span><strong>{winRate?`${winRate.toFixed(2)}%`:"—"}</strong><small>{wins}승 / {Math.max(0,totalTrades-wins)}패</small></article>
   <article><span>▤ 보유 포지션</span><strong>{data.openPositions.length}</strong><small>{p?`${p.symbol} (${p.side.toUpperCase()})`:"대기"}</small></article>
   <article><span>〽 오늘 손익</span><strong className={today>=0?"paper-positive":"paper-negative"}>{money(today)}</strong><small>{today>=0?"플러스":"마이너스"}</small></article>
  </div>

  {p?<div className={`mock-position-strip ${p.side}`}><b>OPEN POSITION</b><span>{p.side.toUpperCase()}</span><strong>{p.symbol}</strong><small>진입가 {money(p.entry_price)}</small><small>현재가 {money(price)}</small><small>ROI <em className={(live?.roiPercent??0)>=0?"paper-positive":"paper-negative"}>{pct(live?.roiPercent)}</em></small><small>미실현 PnL <em className={(live?.unrealizedPnl??0)>=0?"paper-positive":"paper-negative"}>{money(live?.unrealizedPnl)}</em></small></div>:<div className="mock-position-strip waiting"><b>OPEN POSITION</b><span>WAIT</span><strong>현재 보유 포지션 없음</strong><small>AI 진입 조건을 기다리는 중입니다.</small></div>}

  <div className="mock-main-grid mock-trading-main">
    <LiveBitcoinChart positions={data.openPositions} chartOnly simple initialInterval="4h" chartHeight={390} title="BTCUSDT · 모의매매 차트" />
    <div className="mock-right-stack trading-right">
      <article className="mock-panel mock-risk"><h2>♢ 리스크 관리</h2><dl><div><dt>계좌 위험도</dt><dd>{risk==null?"—":`${risk.toFixed(2)}%`}</dd></div><div><dt>포지션 크기</dt><dd>{p?money(p.quantity*p.entry_price):"—"}</dd></div><div><dt>손절 (SL)</dt><dd className="paper-negative">{p?money(p.stop_loss_price):"—"}</dd></div><div><dt>익절 (TP)</dt><dd className="paper-positive">{p?money(p.take_profit_price):"—"}</dd></div><div><dt>리스크/리워드</dt><dd>{rr==null?"—":`1 : ${rr.toFixed(2)}`}</dd></div></dl></article>
      <article className="mock-panel mock-current-strategy"><h2>▣ 현재 전략 <em>{data.config?.strategy_version??"대기"}</em></h2><dl><div><dt>전략 타입</dt><dd>{data.config?"AI 추세 추종":"미설정"}</dd></div><div><dt>시간 프레임</dt><dd>4시간</dd></div><div><dt>진입 조건</dt><dd>{data.decisionV2?.preferred_entry??"AI 점수 + 신뢰도 조건"}</dd></div><div><dt>최근 성과</dt><dd>{winRate?`${winRate.toFixed(2)}%`:"표본 수집 중"}</dd></div></dl></article>
      <article className="mock-panel mock-orders"><h2>☷ 주문 계획</h2><table><tbody><tr><td>익절 (TP)</td><td>{p?money(p.take_profit_price):"—"}</td><td>100%</td><td>대기중</td></tr><tr><td>손절 (SL)</td><td>{p?money(p.stop_loss_price):"—"}</td><td>100%</td><td>대기중</td></tr></tbody></table></article>
      <article className="mock-panel mock-ai-comment"><h2>✧ AI 코멘트</h2><p>{data.decisions[0]?.decision_summary??"현재 시장 신호와 리스크 조건을 확인하며 다음 모의매매 진입을 기다리고 있습니다."}</p><div>신뢰도 <span className="confidence-dots">● ● ● ● ○</span></div></article>
    </div>
  </div>

  <div className="mock-trade-bottom">
    <article className="mock-panel mock-trades"><h2>최근 체결 내역</h2><table><thead><tr><th>시간</th><th>심볼</th><th>방향</th><th>수량</th><th>진입가</th><th>청산가</th><th>손익</th><th>수익률</th></tr></thead><tbody>{recent.length?recent.map(t=><tr key={t.id}><td>{new Date(t.closed_at).toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</td><td>{t.symbol}</td><td className={t.side==="long"?"paper-positive":"paper-negative"}>{t.side.toUpperCase()}</td><td>{t.quantity}</td><td>{money(t.entry_price)}</td><td>{money(t.exit_price)}</td><td className={t.net_pnl>=0?"paper-positive":"paper-negative"}>{money(t.net_pnl)}</td><td>{pct(t.return_percent)}</td></tr>):<tr><td colSpan={8}>거래 표본을 수집 중입니다.</td></tr>}</tbody></table></article>
    <article className="mock-panel mock-performance"><h2>성과 분석</h2><div className="mock-donut" style={{background:`conic-gradient(#26c981 0 ${Math.max(0,Math.min(100,winRate))}%, #ef5350 ${Math.max(0,Math.min(100,winRate))}% 100%)`} as CSSProperties}><span><b>{totalTrades||"—"}</b><small>총 거래</small></span></div><dl><div><dt>총 손익</dt><dd className={realized>=0?"paper-positive":"paper-negative"}>{money(realized)}</dd></div><div><dt>평균 수익</dt><dd>{money(data.strategyPerformance?.average_win)}</dd></div><div><dt>최대 수익</dt><dd>{money(data.strategyPerformance?.average_win)}</dd></div><div><dt>최대 손실</dt><dd className="paper-negative">{money(data.strategyPerformance?.average_loss)}</dd></div><div><dt>프로핏 팩터</dt><dd>{pf==null?"—":pf.toFixed(2)}</dd></div></dl></article>
  </div>
 </section>
}
