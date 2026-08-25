"use client";

import { useEffect, useState } from "react";
import type { PaperTradingData } from "../types";
import { formatDateTime, formatNumber, formatPercent, formatPrice } from "../format";
import { useLiveBtcPrice } from "../hooks/useLiveBtcPrice";
import { calculateLivePositionMetrics } from "../live-position";

function signed(value: number, digits = 2) {
  return `${value >= 0 ? "+" : ""}${formatNumber(value, digits)}`;
}

function holdTime(openedAt: string) {
  const diff = Math.max(0, Date.now() - new Date(openedAt).getTime());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function closeReasonLabel(value: string | null | undefined) {
  const key = String(value ?? "").toLowerCase();
  if (key.includes("take_profit") || key === "tp") return "TP";
  if (key.includes("stop_loss") || key === "sl") return "SL";
  if (key.includes("trailing")) return "Trailing";
  if (key.includes("break_even")) return "Break Even";
  if (key.includes("opposite") || key.includes("signal")) return "Signal";
  if (key.includes("max_holding") || key.includes("time")) return "Time";
  return value || "기타";
}

function EquitySparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="paper2-spark-empty">성과 데이터 수집 중</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const points = values.map((value, index) =>
    `${(index / Math.max(1, values.length - 1)) * 100},${90 - ((value - min) / span) * 72}`
  ).join(" ");
  return (
    <svg className="paper2-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PaperTradingDashboard({ data }: { data: PaperTradingData }) {
  const { price: livePrice, status } = useLiveBtcPrice(data.marketPrice);
  const [, tick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  if (data.error) {
    return <section className="panel paper2-notice"><strong>모의매매 데이터를 불러오지 못했습니다.</strong><span>{data.error}</span></section>;
  }
  if (!data.account) {
    return <section className="panel paper2-notice"><strong>활성 Paper Trading 계정이 없습니다.</strong><span>모의매매 계정 설정을 확인해주세요.</span></section>;
  }

  const { account, openPositions, trades, equity: equityRows, strategyPerformance } = data;
  const primary = openPositions[0] ?? null;
  const marketPrice = livePrice ?? data.marketPrice;
  const primaryMetrics = primary && marketPrice ? calculateLivePositionMetrics(primary, marketPrice) : null;

  const unrealized = marketPrice
    ? openPositions.reduce((sum, position) => sum + calculateLivePositionMetrics(position, marketPrice).unrealizedPnl, 0)
    : 0;
  const reserved = openPositions.reduce((sum, position) => sum + position.entry_price * position.quantity, 0);
  const paperEquity = account.cash_balance + reserved + unrealized;
  const totalPnl = paperEquity - account.initial_balance;
  const totalReturn = account.initial_balance > 0 ? (totalPnl / account.initial_balance) * 100 : 0;

  const wins = trades.filter((trade) => trade.net_pnl > 0);
  const losses = trades.filter((trade) => trade.net_pnl < 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const grossWin = wins.reduce((sum, trade) => sum + trade.net_pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, trade) => sum + trade.net_pnl, 0));
  const profitFactor = strategyPerformance?.profit_factor ?? (grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? grossWin : null);
  const avgWin = wins.length ? wins.reduce((sum, trade) => sum + trade.return_percent, 0) / wins.length : null;
  const avgLoss = losses.length ? losses.reduce((sum, trade) => sum + trade.return_percent, 0) / losses.length : null;
  const maxDrawdown = strategyPerformance?.max_drawdown_percent ?? null;
  const recentTrades = trades.slice(0, 5);
  const equityValues = equityRows.slice(-60).map((row) => Number(row.equity)).filter(Number.isFinite);

  const decision = primary?.opening_decision_id ? data.decisionsById[primary.opening_decision_id] : data.decisions[0];
  const reason = decision?.decision_summary
    ?? (primary ? `${primary.side === "long" ? "LONG" : "SHORT"} 진입 조건 충족` : "다음 진입 신호를 기다리고 있습니다.");

  return (
    <section className="paper2-dashboard">
      <header className="paper2-header">
        <div>
          <span className="section-kicker">PAPER TRADING</span>
          <h1>모의매매</h1>
          <p>실제 자금 없이 전략을 검증하고 현재 포지션과 성과를 추적합니다.</p>
        </div>
        <span className={`paper2-live ${status}`}><i />Paper Trading ON</span>
      </header>

      <article className={`panel paper2-position ${primary ? primary.side : "empty"}`}>
        <div className="paper2-position-head">
          <div>
            <span>현재 포지션</span>
            {primary ? (
              <div className="paper2-symbol-row">
                <b className={`paper2-side ${primary.side}`}>{primary.side.toUpperCase()}</b>
                <strong>{primary.symbol}</strong>
              </div>
            ) : <strong className="paper2-no-position">현재 열린 포지션 없음</strong>}
          </div>
          {primary ? <div className="paper2-hold"><span>보유 시간</span><strong>{holdTime(primary.opened_at)}</strong></div> : null}
        </div>

        {primary && primaryMetrics && marketPrice ? (
          <>
            <div className="paper2-position-grid">
              <div><span>진입가</span><strong>{formatPrice(primary.entry_price)}</strong></div>
              <div><span>현재가</span><strong>{formatPrice(marketPrice)}</strong></div>
              <div><span>수익률</span><strong className={primaryMetrics.roiPercent >= 0 ? "paper-positive" : "paper-negative"}>{formatPercent(primaryMetrics.roiPercent, 2)}</strong></div>
              <div><span>평가손익 (USDT)</span><strong className={primaryMetrics.unrealizedPnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(primaryMetrics.unrealizedPnl)} </strong></div>
              <div><span>SL (손절가)</span><strong className="paper-negative">{formatPrice(primary.stop_loss_price)}</strong></div>
              <div><span>TP (목표가)</span><strong className="paper-positive">{formatPrice(primary.take_profit_price)}</strong></div>
              <div><span>포지션 크기</span><strong>{formatPrice(primary.entry_price * primary.quantity)}</strong><small>{formatNumber(primary.quantity, 6)} BTC</small></div>
              <div><span>진입 시각</span><strong className="paper2-small-value">{formatDateTime(primary.opened_at)}</strong></div>
            </div>
            <div className="paper2-entry-reason">
              <span>진입 이유</span>
              <strong>{reason}</strong>
            </div>
          </>
        ) : (
          <div className="paper2-empty-position">
            <strong>다음 진입 신호 대기 중</strong>
            <span>포지션이 열리면 진입가 · 현재가 · 손익 · SL · TP가 이 영역에 표시됩니다.</span>
          </div>
        )}
      </article>

      <section className="paper2-kpis">
        <article className="panel">
          <span>Paper 자산</span>
          <strong>{formatPrice(paperEquity)}</strong>
          <small className={totalReturn >= 0 ? "paper-positive" : "paper-negative"}>{formatPercent(totalReturn, 2)}</small>
          <EquitySparkline values={equityValues.length ? equityValues : [account.initial_balance, paperEquity]} />
        </article>
        <article className="panel">
          <span>누적 손익</span>
          <strong className={totalPnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(totalPnl)} USDT</strong>
          <small className={totalReturn >= 0 ? "paper-positive" : "paper-negative"}>{formatPercent(totalReturn, 2)}</small>
          <EquitySparkline values={equityValues.length ? equityValues : [account.initial_balance, paperEquity]} />
        </article>
        <article className="panel">
          <span>승률</span>
          <strong>{formatNumber(winRate, 1)}%</strong>
          <small>{wins.length}승 / {losses.length}패</small>
        </article>
        <article className="panel">
          <span>총 거래</span>
          <strong>{trades.length}회</strong>
          <small>진행 {openPositions.length}건</small>
        </article>
      </section>

      <article className="panel paper2-performance">
        <h2>성과 요약</h2>
        <div>
          <span><small>Profit Factor</small><strong>{profitFactor == null ? "—" : formatNumber(profitFactor, 2)}</strong></span>
          <span><small>평균 수익 (Win)</small><strong className="paper-positive">{avgWin == null ? "—" : formatPercent(avgWin, 2)}</strong></span>
          <span><small>평균 손실 (Loss)</small><strong className="paper-negative">{avgLoss == null ? "—" : formatPercent(avgLoss, 2)}</strong></span>
          <span><small>최대 낙폭 (MDD)</small><strong className={maxDrawdown != null && maxDrawdown < 0 ? "paper-negative" : ""}>{maxDrawdown == null ? "—" : formatPercent(maxDrawdown, 2)}</strong></span>
        </div>
      </article>

      <article className="panel paper2-recent">
        <div className="paper2-section-head">
          <h2>최근 거래</h2>
          <span>최근 5건</span>
        </div>
        {recentTrades.length ? (
          <div className="paper2-table-wrap">
            <table>
              <thead><tr><th>방향</th><th>진입가</th><th>청산가</th><th>손익 (USDT)</th><th>수익률</th><th>청산 이유</th><th>종료 시간</th></tr></thead>
              <tbody>
                {recentTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td><b className={`paper2-side ${trade.side}`}>{trade.side.toUpperCase()}</b></td>
                    <td>{formatPrice(trade.entry_price)}</td>
                    <td>{formatPrice(trade.exit_price)}</td>
                    <td className={trade.net_pnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(trade.net_pnl)}</td>
                    <td className={trade.return_percent >= 0 ? "paper-positive" : "paper-negative"}>{formatPercent(trade.return_percent, 2)}</td>
                    <td><span className="paper2-reason">{closeReasonLabel(trade.close_reason)}</span></td>
                    <td>{formatDateTime(trade.closed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="paper2-empty-table">아직 완료된 거래가 없습니다.</div>}
      </article>
    </section>
  );
}
