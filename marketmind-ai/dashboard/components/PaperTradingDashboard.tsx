import type { FinalMarketDecision, PaperPosition, PaperTradingData } from "../types";
import { formatDateTime, formatNumber, formatPercent, formatPrice, formatRelativeTime } from "../format";

function signed(value: number, digits = 2) {
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}`;
}

function pnlForPosition(position: PaperPosition, marketPrice: number | null) {
  if (!marketPrice) return { pnl: 0, roi: 0 };
  const gross = position.side === "long"
    ? (marketPrice - position.entry_price) * position.quantity
    : (position.entry_price - marketPrice) * position.quantity;
  const pnl = gross - position.entry_fee;
  const notional = position.entry_price * position.quantity;
  return { pnl, roi: notional > 0 ? (pnl / notional) * 100 : 0 };
}

function secondsLabel(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const totalMinutes = Math.max(0, Math.round(value / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function closeReasonLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    take_profit: "익절",
    stop_loss: "손절",
    max_holding: "최대 보유시간",
    opposite_signal: "반대 신호",
    signal_exit: "신호 청산",
    timeout: "시간 종료",
    manual: "수동 청산",
  };
  return value ? (labels[value] ?? value) : "기타";
}

function durationLabel(openedAt: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}


function koDirection(value: string | null | undefined) {
  if (value === "bullish") return "상승";
  if (value === "bearish") return "하락";
  if (value === "neutral") return "중립";
  return value ?? "—";
}

function koAction(value: string | null | undefined) {
  if (value === "strong_buy") return "강한 매수";
  if (value === "buy") return "매수";
  if (value === "wait" || value === "hold") return "관망";
  if (value === "reduce") return "비중 축소";
  if (value === "sell") return "매도";
  return value ?? "—";
}

function koPermission(value: string | null | undefined) {
  if (value === "allowed") return "허용됨";
  if (value === "caution") return "주의 필요";
  if (value === "blocked") return "차단됨";
  return value ?? "—";
}

function koRunStatus(value: string) {
  const key = value.toLowerCase();
  if (key === "skipped") return "진입 보류";
  if (["opened", "opened_long", "opened_short"].includes(key)) return "진입";
  if (key === "closed") return "청산";
  if (key === "held") return "보유 중";
  if (key === "failed") return "오류";
  return value;
}

function koRegime(value: string | null | undefined) {
  const map: Record<string,string> = { bull_trend:"상승 추세", bear_trend:"하락 추세", volatility_compression:"변동성 압축", range:"횡보 구간" };
  return value ? (map[value] ?? value) : "—";
}

function reasonItems(decision: FinalMarketDecision | undefined): string[] {
  if (!decision) return [];
  const rows = Array.isArray(decision.decision_reasons) ? decision.decision_reasons : [];
  const technical = rows.find((row) => typeof row === "object" && row !== null && "type" in row && row.type === "technical");
  const details = decision.score_details && typeof decision.score_details === "object" && !Array.isArray(decision.score_details) ? decision.score_details : null;
  const technicalReasons = details && "technical" in details && typeof details.technical === "object" && details.technical && "reasons" in details.technical && Array.isArray(details.technical.reasons)
    ? details.technical.reasons.filter((item): item is string => typeof item === "string")
    : [];
  if (technicalReasons.length) return technicalReasons.slice(0, 5);
  return technical ? ["기술 신호와 시장 방향이 진입 조건에 일치했습니다."] : [decision.decision_summary ?? "AI 진입 판단 데이터가 기록되었습니다."];
}

function conditionState(decision: FinalMarketDecision | undefined, config: PaperTradingData["config"]) {
  if (!decision || !config) return [];
  const finalScore = decision.final_score ?? 50;
  const finalConfidence = decision.final_confidence ?? 0;
  const isLong = decision.direction === "bullish" && ["buy", "strong_buy"].includes(decision.action ?? "");
  const isShort = decision.direction === "bearish" && ["reduce", "sell"].includes(decision.action ?? "");
  return [
    { label: "최종 점수", value: decision.final_score, target: isShort ? `≤ ${config.short_score_max}` : `≥ ${config.long_score_min}`, ok: isShort ? finalScore <= config.short_score_max : finalScore >= config.long_score_min },
    { label: "신뢰도", value: decision.final_confidence, target: `≥ ${config.confidence_min}`, ok: finalConfidence >= config.confidence_min },
    { label: "방향", value: koDirection(decision.direction), target: "상승 / 하락", ok: decision.direction === "bullish" || decision.direction === "bearish" },
    { label: "액션", value: koAction(decision.action), target: isShort ? "매도" : "매수", ok: isLong || isShort },
    { label: "권한", value: koPermission(decision.trading_permission), target: "허용됨", ok: decision.trading_permission === "allowed" },
  ];
}

function waitingSummary(decision: FinalMarketDecision | undefined, config: PaperTradingData["config"]) {
  if (!decision || !config) return "최신 AI 판단을 기다리고 있습니다.";
  const failed = conditionState(decision, config).filter((item) => !item.ok);
  if (!failed.length) return "진입 조건은 충족했지만 포지션 생성 상태를 확인하고 있습니다.";
  const names = failed.map((item) => item.label).join(", ");
  return `${names} 조건이 기준에 도달하지 않아 이번 진입을 보류했습니다.`;
}

function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string; sub: string; tone?: "positive" | "negative" | "default" | "accent" }) {
  return <article className="paper-kpi panel"><span>{label}</span><strong className={`paper-${tone}`}>{value}</strong><small>{sub}</small></article>;
}

function EquityChart({ data, initialBalance }: { data: PaperTradingData["equity"]; initialBalance: number }) {
  const source = data.length > 1 ? data : [{ equity: initialBalance, captured_at: new Date().toISOString() }, { equity: initialBalance, captured_at: new Date().toISOString() }];
  const values = source.map((row) => Number(row.equity));
  const min = Math.min(...values) - Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15);
  const max = Math.max(...values) + Math.max(1, (Math.max(...values) - Math.min(...values)) * 0.15);
  const points = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${92 - ((value - min) / Math.max(1, max - min)) * 76}`).join(" ");
  return <div className="paper-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><linearGradient id="paperArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity=".5"/><stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 100,100`} fill="url(#paperArea)"/><polyline points={points} fill="none" stroke="#9b6cff" strokeWidth="1.4" vectorEffect="non-scaling-stroke"/></svg></div>;
}

export function PaperTradingDashboard({ data }: { data: PaperTradingData }) {
  if (data.error) return <section className="panel paper-notice"><strong>Paper Trading 데이터를 불러오지 못했습니다.</strong><span>{data.error}</span></section>;
  if (!data.account) return <section className="panel paper-notice"><strong>Paper Trading 계정이 없습니다.</strong><span>010-paper-trading-v1.sql 실행 여부를 확인해주세요.</span></section>;

  const { account, config, openPositions, trades, runs, marketPrice, strategyPerformance } = data;
  const unrealized = openPositions.reduce((sum, position) => sum + pnlForPosition(position, marketPrice).pnl, 0);
  const equity = account.cash_balance + openPositions.reduce((sum, position) => sum + position.entry_price * position.quantity, 0) + unrealized;
  const totalPnl = account.realized_pnl + unrealized;
  const wins = trades.filter((trade) => trade.net_pnl > 0).length;
  const losses = trades.filter((trade) => trade.net_pnl < 0).length;
  const winRate = trades.length ? (wins / trades.length) * 100 : 0;
  const returns = trades.map((trade) => trade.return_percent);
  const avgReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const grossWins = trades.filter((trade) => trade.net_pnl > 0).reduce((sum, trade) => sum + trade.net_pnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.net_pnl < 0).reduce((sum, trade) => sum + trade.net_pnl, 0));
  const profitFactor = grossLoss > 0 ? grossWins / grossLoss : grossWins > 0 ? grossWins : 0;
  const primary = openPositions[0] ?? null;
  const primaryDecision = primary?.opening_decision_id ? data.decisionsById[primary.opening_decision_id] : undefined;
  const primaryPnl = primary ? pnlForPosition(primary, marketPrice) : null;
  const rejectionCounts = runs.filter((run) => run.action_taken === "skipped").reduce<Record<string, number>>((acc, run) => { acc[run.reason] = (acc[run.reason] ?? 0) + 1; return acc; }, {});
  const latestRun = runs[0];
  const latestDecision = latestRun?.decision_id
    ? data.decisionsById[latestRun.decision_id]
    : data.decisions[0];
  const latestConditions = conditionState(latestDecision, config);
  const runStats = runs.reduce<Record<string, number>>((acc, run) => { const key = run.action_taken.toLowerCase(); acc[key] = (acc[key] ?? 0) + 1; return acc; }, {});
  const openedRuns =
    (runStats.opened ?? 0) +
    (runStats.opened_long ?? 0) +
    (runStats.opened_short ?? 0);
  const averageHoldingMinutes = trades.length
    ? trades.reduce((sum, trade) => {
        const opened = new Date(trade.opened_at).getTime();
        const closed = new Date(trade.closed_at).getTime();
        return sum + (Number.isFinite(opened) && Number.isFinite(closed) ? Math.max(0, closed - opened) / 60_000 : 0);
      }, 0) / trades.length
    : null;

  return <section className="paper-dashboard">
    <header className="paper-title"><div><h1>모의매매 대시보드 <span>V2</span></h1><p>AI 기반 모의매매 현황과 실제 유지 중인 포지션을 확인합니다.</p></div><div className="paper-live"><i/>시스템 정상 · 최근 실행 {formatRelativeTime(runs[0]?.created_at ?? null)}</div></header>

    <div className="paper-kpi-grid">
      <Kpi label="가상 잔고" value={`${formatPrice(equity)} USDT`} sub={`사용 가능 ${formatPrice(account.cash_balance)} USDT`} />
      <Kpi label="미실현 손익" value={`${signed(unrealized)} USDT`} sub={formatPercent(account.initial_balance ? unrealized / account.initial_balance * 100 : 0)} tone={unrealized >= 0 ? "positive" : "negative"}/>
      <Kpi label="실현 손익" value={`${signed(totalPnl)} USDT`} sub={formatPercent(account.initial_balance ? totalPnl / account.initial_balance * 100 : 0)} tone={totalPnl >= 0 ? "positive" : "negative"}/>
      <Kpi label="누적 수수료" value={`${formatPrice(account.total_fees)} USDT`} sub="누적 수수료" />
      <Kpi label="승률" value={`${formatNumber(winRate, 2)}%`} sub={`${wins} / ${trades.length}`} tone="accent"/>
      <Kpi label="유지 중인 포지션" value={String(openPositions.length)} sub="실제 유지 포지션 수" tone="accent"/>
      <Kpi label="총 거래" value={String(trades.length)} sub="청산 완료 거래" />
    </div>

    <div className="paper-main-grid">
      <article className="panel paper-runs"><h2>워커 실행 결과 <small>최근 10건</small></h2><div className="paper-run-stats"><span><b>{runs.length}</b>실행</span><span><b>{openedRuns}</b>진입</span><span><b>{runStats.closed ?? 0}</b>청산</span><span><b>{runStats.skipped ?? 0}</b>대기</span></div><div className="paper-table-wrap"><table><thead><tr><th>시간</th><th>결과</th><th>종목</th><th>결정 ID</th><th>가격</th><th>사유 / 요약</th></tr></thead><tbody>{runs.slice(0,10).map((run)=><tr key={run.id}><td>{formatDateTime(run.created_at)}</td><td><b className={`paper-status ${run.action_taken}`}>{koRunStatus(run.action_taken)}</b></td><td>{run.symbol}</td><td>{run.decision_id ?? "—"}</td><td>{formatPrice(run.market_price)}</td><td className="paper-left">{run.reason}</td></tr>)}</tbody></table></div></article>

      <article className="panel paper-position-card"><div className="paper-section-head"><h2>현재 유지 중인 포지션 <span>{openPositions.length}</span></h2>{primary ? <b className={`paper-side ${primary.side}`}>{primary.side === "long" ? "롱" : "숏"}</b> : null}</div>
        {!primary ? <div className="paper-waiting"><div className="paper-waiting-head"><div><span className="paper-pulse"/>진입 대기 중</div><strong>{latestDecision ? formatNumber(latestDecision.final_score, 2) : "—"}</strong><small>현재 최종 점수</small></div><div className="paper-condition-grid">{latestConditions.map((item) => <div key={item.label} className={item.ok ? "ok" : "fail"}><span>{item.label}</span><b>{typeof item.value === "number" ? formatNumber(item.value, 2) : String(item.value ?? "—")}</b><small>기준 {item.target}</small><i>{item.ok ? "통과" : "대기"}</i></div>)}</div><div className="paper-wait-progress"><div><span>SHORT {config?.short_score_max ?? 30}</span><b style={{left:`${Math.min(100, Math.max(0, Number(latestDecision?.final_score ?? 50)))}%`}}/><span>LONG {config?.long_score_min ?? 70}</span></div><p>{waitingSummary(latestDecision, config)}</p></div><div className="paper-entry-analysis paper-wait-analysis"><div><h3>AI 진입 분석</h3><dl><dt>최종 점수</dt><dd>{formatNumber(latestDecision?.final_score ?? null,2)}</dd><dt>신뢰도</dt><dd>{formatPercent(latestDecision?.final_confidence ?? null)}</dd><dt>기술 분석</dt><dd>{formatNumber(latestDecision?.technical_score ?? null,2)}</dd><dt>뉴스 분석</dt><dd>{formatNumber(latestDecision?.news_score ?? null,2)}</dd><dt>펀딩 분석</dt><dd>{formatNumber(latestDecision?.funding_score ?? null,2)}</dd><dt>시장 국면</dt><dd>{koRegime(latestDecision?.market_regime)}</dd></dl></div><div><h3>현재 판단 근거</h3><ul>{reasonItems(latestDecision).map((reason)=><li key={reason}>{reason}</li>)}</ul></div><blockquote><b>AI 판단 요약</b>{latestDecision?.decision_summary ?? waitingSummary(latestDecision, config)}</blockquote></div></div> : <>
          <div className="paper-position-title"><strong>{primary.symbol}</strong><small>진입 시각 {formatDateTime(primary.opened_at)}</small></div>
          <div className="paper-position-values"><div><span>진입 가격</span><strong>{formatPrice(primary.entry_price)}</strong></div><div><span>현재 가격</span><strong>{formatPrice(marketPrice)}</strong></div><div><span>수량</span><strong>{formatNumber(primary.quantity, 8)}</strong></div><div><span>미실현 PnL</span><strong className={primaryPnl && primaryPnl.pnl >= 0 ? "paper-positive" : "paper-negative"}>{primaryPnl ? `${signed(primaryPnl.pnl)} USDT` : "—"}</strong></div><div><span>ROI</span><strong className={primaryPnl && primaryPnl.roi >= 0 ? "paper-positive" : "paper-negative"}>{primaryPnl ? formatPercent(primaryPnl.roi) : "—"}</strong></div><div><span>보유 시간</span><strong>{durationLabel(primary.opened_at)}</strong></div></div>
          <div className="paper-risk-values"><span>SL <b>{formatPrice(primary.stop_loss_price)}</b></span><span>현재가 <b>{formatPrice(marketPrice)}</b></span><span>TP <b>{formatPrice(primary.take_profit_price)}</b></span></div>
          <div className="paper-risk-bar"><i style={{left: `${Math.min(100, Math.max(0, ((Number(marketPrice ?? primary.entry_price) - primary.stop_loss_price)/(primary.take_profit_price-primary.stop_loss_price))*100))}%`}}/></div>
          <div className="paper-entry-analysis"><div><h3>AI 진입 분석</h3><dl><dt>최종 점수</dt><dd>{formatNumber(primaryDecision?.final_score ?? null,2)}</dd><dt>신뢰도</dt><dd>{formatPercent(primaryDecision?.final_confidence ?? null)}</dd><dt>기술 분석</dt><dd>{formatNumber(primaryDecision?.technical_score ?? null,2)}</dd><dt>뉴스 분석</dt><dd>{formatNumber(primaryDecision?.news_score ?? null,2)}</dd><dt>펀딩 분석</dt><dd>{formatNumber(primaryDecision?.funding_score ?? null,2)}</dd><dt>시장 국면</dt><dd>{koRegime(primaryDecision?.market_regime)}</dd></dl></div><div><h3>진입 이유</h3><ul>{reasonItems(primaryDecision).map((reason)=><li key={reason}>{reason}</li>)}</ul></div><blockquote><b>AI 판단 요약</b>{primaryDecision?.decision_summary ?? "포지션 진입 당시 AI 판단 요약이 없습니다."}</blockquote></div>
        </>}
      </article>

      <aside className="paper-side-stack"><article className="panel paper-rejections"><h2>진입 거절 사유 <small>최근 기록</small></h2>{Object.entries(rejectionCounts).slice(0,5).map(([reason,count])=><div key={reason}><span>{reason}</span><b>{count}</b></div>)}</article><article className="panel paper-strategy"><h2>전략 기준 <small>{config?.strategy_version ?? "—"}</small></h2><dl><dt>롱 진입</dt><dd>최종 점수 ≥ {config?.long_score_min ?? "—"}</dd><dt>숏 진입</dt><dd>최종 점수 ≤ {config?.short_score_max ?? "—"}</dd><dt>신뢰도</dt><dd>≥ {config?.confidence_min ?? "—"}</dd><dt>포지션 크기</dt><dd>{config?.position_size_percent ?? "—"}%</dd><dt>SL / TP</dt><dd>{config?.stop_loss_percent ?? "—"}% / {config?.take_profit_percent ?? "—"}%</dd><dt>최대 보유 시간</dt><dd>{config ? `${Math.round(config.max_holding_minutes/60)}h` : "—"}</dd></dl></article><article className="panel paper-worker-monitor"><h2>워커 모니터 <small>최근 파이프라인 상태</small></h2><div>{["수집기","기술 분석","뉴스 분석","펀딩 분석","최종 AI","모의매매 워커","백테스트","성과 분석"].map((name,index)=><span key={name}><i className={index===6 && !runs.length ? "waiting" : "running"}/><b>{name}</b><small>{index===5 ? formatRelativeTime(latestRun?.created_at ?? null) : "정상"}</small></span>)}</div></article></aside>
    </div>

    <article className="panel paper-holdings"><h2>유지 중인 포지션 <small>실제 보유 포지션</small></h2><div className="paper-table-wrap"><table><thead><tr><th>종목</th><th>방향</th><th>진입 가격</th><th>현재 가격</th><th>수량</th><th>미실현 PnL</th><th>ROI</th><th>진입 시간</th><th>보유 시간</th><th>TP</th><th>SL</th><th>상태</th></tr></thead><tbody>{openPositions.length ? openPositions.map((position)=>{const p=pnlForPosition(position,marketPrice);return <tr key={position.id}><td>{position.symbol}</td><td><b className={`paper-side ${position.side}`}>{position.side === "long" ? "롱" : "숏"}</b></td><td>{formatPrice(position.entry_price)}</td><td>{formatPrice(marketPrice)}</td><td>{formatNumber(position.quantity,8)}</td><td className={p.pnl>=0?"paper-positive":"paper-negative"}>{signed(p.pnl)}</td><td className={p.roi>=0?"paper-positive":"paper-negative"}>{formatPercent(p.roi)}</td><td>{formatDateTime(position.opened_at)}</td><td>{durationLabel(position.opened_at)}</td><td>{formatPrice(position.take_profit_price)}</td><td>{formatPrice(position.stop_loss_price)}</td><td><b className="paper-status held">보유 중</b></td></tr>}) : <tr><td colSpan={12}>현재 유지 중인 포지션이 없습니다.</td></tr>}</tbody></table></div></article>

    <div className="paper-bottom-grid"><article className="panel paper-trades"><h2>최근 거래 내역</h2><div className="paper-table-wrap"><table><thead><tr><th>청산 시간</th><th>종목</th><th>방향</th><th>진입가</th><th>청산가</th><th>수량</th><th>수수료</th><th>PnL</th><th>수익률</th><th>유형</th></tr></thead><tbody>{trades.slice(0,8).map((trade)=><tr key={trade.id}><td>{formatDateTime(trade.closed_at)}</td><td>{trade.symbol}</td><td><b className={`paper-side ${trade.side}`}>{trade.side === "long" ? "롱" : "숏"}</b></td><td>{formatPrice(trade.entry_price)}</td><td>{formatPrice(trade.exit_price)}</td><td>{formatNumber(trade.quantity,8)}</td><td>{formatNumber(trade.fees,4)}</td><td className={trade.net_pnl>=0?"paper-positive":"paper-negative"}>{signed(trade.net_pnl)}</td><td className={trade.return_percent>=0?"paper-positive":"paper-negative"}>{formatPercent(trade.return_percent)}</td><td>{trade.close_reason}</td></tr>)}</tbody></table></div></article><article className="panel paper-performance"><h2>성과 요약</h2><EquityChart data={data.equity} initialBalance={account.initial_balance}/><div className="paper-performance-values"><span>누적 수익률 <b className={totalPnl>=0?"paper-positive":"paper-negative"}>{formatPercent(totalPnl/account.initial_balance*100)}</b></span><span>총 실현 손익 <b className={account.realized_pnl>=0?"paper-positive":"paper-negative"}>{signed(account.realized_pnl)} USDT</b></span><span>평균 수익률 <b>{formatPercent(avgReturn)}</b></span><span>수익 팩터 <b>{formatNumber(profitFactor,2)}</b></span></div></article></div>

    {strategyPerformance ? <section className="panel paper-analytics-v2">
      <div className="paper-analytics-head"><div><h2>전략 성과 분석 <small>Phase 6-1 V2</small></h2><p>최신 성과 스냅샷 · {formatRelativeTime(strategyPerformance.analyzed_at)}</p></div><span className={`paper-sample-status ${strategyPerformance.sample_status}`}>{strategyPerformance.sample_status === "ready" ? "검증 준비" : strategyPerformance.sample_status === "provisional" ? "검증 중" : "표본 수집 중"}</span></div>
      <div className="paper-analytics-kpis">
        <div><span>승률</span><strong>{strategyPerformance.win_rate === null ? "—" : `${formatNumber(strategyPerformance.win_rate, 2)}%`}</strong><small>{strategyPerformance.winning_trades}승 / {strategyPerformance.losing_trades}패</small></div>
        <div><span>Profit Factor</span><strong>{strategyPerformance.profit_factor === null ? "—" : formatNumber(strategyPerformance.profit_factor, 2)}</strong><small>1.0 이상이면 총이익 우위</small></div>
        <div><span>평균 보유시간</span><strong>{secondsLabel(strategyPerformance.average_holding_seconds)}</strong><small>최대 {secondsLabel(strategyPerformance.max_holding_seconds)}</small></div>
        <div><span>순손익</span><strong className={strategyPerformance.net_pnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(strategyPerformance.net_pnl)} USDT</strong><small>평균 수익률 {strategyPerformance.average_return_percent === null ? "—" : formatPercent(strategyPerformance.average_return_percent)}</small></div>
        <div><span>MDD</span><strong className="paper-negative">{strategyPerformance.max_drawdown_percent === null ? "—" : formatPercent(-Math.abs(strategyPerformance.max_drawdown_percent))}</strong><small>최대 낙폭</small></div>
      </div>
      <div className="paper-analytics-grid">
        <article><h3>LONG / SHORT 성과</h3><div className="paper-analysis-table"><div className="head"><span>방향</span><span>거래</span><span>승률</span><span>순손익</span><span>PF</span></div>{strategyPerformance.side_performance.map((row)=><div key={row.side ?? "side"}><span><b className={`paper-side ${row.side ?? "long"}`}>{row.side === "short" ? "숏" : "롱"}</b></span><span>{row.totalTrades}</span><span>{row.winRate === null ? "—" : `${formatNumber(row.winRate,1)}%`}</span><span className={row.netPnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(row.netPnl)}</span><span>{row.profitFactor === null ? "—" : formatNumber(row.profitFactor,2)}</span></div>)}</div></article>
        <article><h3>Confidence 구간별 성과</h3><div className="paper-analysis-table"><div className="head"><span>구간</span><span>거래</span><span>승률</span><span>평균수익</span><span>PF</span></div>{strategyPerformance.confidence_performance.map((row)=><div key={row.bucket ?? "bucket"} className={row.totalTrades === 0 ? "muted" : ""}><span>{row.bucket ?? "—"}</span><span>{row.totalTrades}</span><span>{row.winRate === null ? "—" : `${formatNumber(row.winRate,1)}%`}</span><span className={(row.averageReturnPercent ?? 0) >= 0 ? "paper-positive" : "paper-negative"}>{row.averageReturnPercent === null ? "—" : formatPercent(row.averageReturnPercent)}</span><span>{row.profitFactor === null ? "—" : formatNumber(row.profitFactor,2)}</span></div>)}</div></article>
        <article><h3>청산 사유별 성과</h3><div className="paper-exit-reasons">{strategyPerformance.exit_reason_performance.length ? strategyPerformance.exit_reason_performance.map((row)=><div key={row.reason ?? "reason"}><span><b>{closeReasonLabel(row.reason)}</b><small>{row.totalTrades}건 · 승률 {row.winRate === null ? "—" : `${formatNumber(row.winRate,1)}%`}</small></span><strong className={row.netPnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(row.netPnl)} USDT</strong></div>) : <p>청산 데이터가 아직 없습니다.</p>}</div></article>
      </div>
      <div className="paper-sample-progress"><div><span>현재 {strategyPerformance.total_trades}건</span><span>Provisional까지 {strategyPerformance.trades_until_provisional}건 · Ready까지 {strategyPerformance.trades_until_ready}건</span></div><i><b style={{width:`${Math.min(100, (strategyPerformance.total_trades / 50) * 100)}%`}}/></i></div>
    </section> : null}

    <article className="panel paper-recent-decisions"><h2>최근 AI 판단 목록 <small>최근 10건</small></h2><div className="paper-table-wrap"><table><thead><tr><th>판단 시간</th><th>최종 신호</th><th>점수</th><th>신뢰도</th><th>시장 국면</th><th>추천 전략</th><th>거래 권한</th></tr></thead><tbody>{runs.slice(0,10).map((run)=>{const d=run.decision_id?data.decisionsById[run.decision_id]:undefined;return <tr key={`decision-${run.id}`}><td>{formatDateTime(run.created_at)}</td><td><b className={`paper-signal ${d?.action ?? "hold"}`}>{koAction(d?.action)}</b></td><td><strong className="paper-score-value">{formatNumber(d?.final_score ?? null,1)}</strong></td><td><strong className="paper-confidence-value">{formatPercent(d?.final_confidence ?? null)}</strong></td><td><span className="paper-regime-badge">{koRegime(d?.market_regime)}</span></td><td>{d?.direction === "bullish" ? "분할 매수 전략" : d?.direction === "bearish" ? "분할 매도 전략" : "관망 전략"}</td><td><b className={`paper-permission ${d?.trading_permission ?? "unknown"}`}>{koPermission(d?.trading_permission)}</b></td></tr>})}</tbody></table></div></article>

    <article className="panel paper-timeline"><h2>모의매매 타임라인 <small>최근 AI 의사결정 흐름</small></h2><div>{runs.slice(0,8).reverse().map((run)=><span key={run.id}><i className={`paper-status-dot ${run.action_taken.toLowerCase()}`}/><small>{formatDateTime(run.created_at)}</small><b>{koRunStatus(run.action_taken)}</b><em>{run.reason}</em></span>)}</div></article>

    <article className="panel paper-summary"><h2>전략별 성과 요약 <small>{config?.strategy_version ?? "paper-trading-v2"}</small></h2><div><span>총 거래 수<b>{trades.length}</b></span><span>승리 거래 수<b>{wins}</b></span><span>패배 거래 수<b>{losses}</b></span><span>승률<b>{formatNumber(winRate,2)}%</b></span><span>평균 수익률<b className={avgReturn>=0?"paper-positive":"paper-negative"}>{formatPercent(avgReturn)}</b></span><span>수익 팩터<b>{formatNumber(profitFactor,2)}</b></span><span>누적 수수료<b>{formatNumber(account.total_fees,2)}</b></span><span>평균 보유 시간<b>{averageHoldingMinutes === null ? "—" : `${Math.round(averageHoldingMinutes)}m`}</b></span></div></article>
  </section>;
}
