import Link from "next/link";
import type { PaperPosition, PaperTradingData } from "../types";
import { formatNumber, formatPercent, formatPrice } from "../format";

function positionPnl(position: PaperPosition, marketPrice: number | null) {
  const price = marketPrice ?? position.entry_price;
  const direction = position.side === "long" ? 1 : -1;
  const pnl = (price - position.entry_price) * position.quantity * direction - position.entry_fee;
  const notional = position.entry_price * position.quantity;
  const roi = notional > 0 ? (pnl / notional) * 100 : 0;
  return { pnl, roi };
}

export function PaperTradingSummary({ data }: { data: PaperTradingData }) {
  if (data.error) {
    return (
      <section className="panel trading-summary-card">
        <div><span className="section-kicker">PAPER TRADING</span><h2>모의 트레이딩 요약</h2></div>
        <p className="summary-error">데이터를 불러오지 못했습니다: {data.error}</p>
        <Link className="detail-link" href="/trading">상세 페이지 열기 →</Link>
      </section>
    );
  }

  if (!data.account) {
    return (
      <section className="panel trading-summary-card">
        <div><span className="section-kicker">PAPER TRADING</span><h2>모의 트레이딩 요약</h2></div>
        <p>활성화된 Paper Trading 계정이 없습니다.</p>
        <Link className="detail-link" href="/trading">설정 상태 확인 →</Link>
      </section>
    );
  }

  const primary = data.openPositions[0] ?? null;
  const openPnl = data.openPositions.reduce((sum, position) => sum + positionPnl(position, data.marketPrice).pnl, 0);
  const equity = data.account.cash_balance + openPnl;
  const totalReturn = data.account.initial_balance > 0
    ? ((equity - data.account.initial_balance) / data.account.initial_balance) * 100
    : 0;
  const wins = data.trades.filter((trade) => trade.net_pnl > 0).length;
  const winRate = data.trades.length ? (wins / data.trades.length) * 100 : 0;
  const primaryResult = primary ? positionPnl(primary, data.marketPrice) : null;

  return (
    <section className="panel trading-summary-card">
      <div className="trading-summary-head">
        <div><span className="section-kicker">PAPER TRADING</span><h2>모의 트레이딩 요약</h2></div>
        <Link className="detail-link" href="/trading">트레이딩 상세 보기 →</Link>
      </div>

      <div className="trading-summary-grid">
        <div><span>현재 포지션</span><strong>{primary ? `${primary.symbol} · ${primary.side === "long" ? "LONG" : "SHORT"}` : "포지션 없음"}</strong><small>{primary ? `진입가 ${formatPrice(primary.entry_price)}` : "신규 진입 신호 대기 중"}</small></div>
        <div><span>미실현 손익</span><strong className={openPnl >= 0 ? "paper-positive" : "paper-negative"}>{openPnl >= 0 ? "+" : ""}{formatNumber(openPnl, 2)} USDT</strong><small>{primaryResult ? `현재 ROI ${formatPercent(primaryResult.roi)}` : "열린 포지션 기준"}</small></div>
        <div><span>누적 수익률</span><strong className={totalReturn >= 0 ? "paper-positive" : "paper-negative"}>{formatPercent(totalReturn)}</strong><small>추정 자산 {formatNumber(equity, 2)} USDT</small></div>
        <div><span>거래 성과</span><strong>{formatNumber(winRate, 1)}%</strong><small>총 {data.trades.length}회 · 승리 {wins}회</small></div>
      </div>
    </section>
  );
}
