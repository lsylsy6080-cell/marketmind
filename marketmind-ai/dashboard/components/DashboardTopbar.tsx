import { formatDateTime, formatRelativeTime } from "../format";

export function DashboardTopbar({ updatedAt }: { updatedAt: string }) {
  return (
    <header className="topbar">
      <div className="brand-block">
        <div className="brand-mark">M</div>
        <div><strong>MarketMind AI</strong><span>BTC Intelligence Terminal</span></div>
      </div>
      <div className="topbar-status">
        <span className="live-dot" />
        <div><strong>시스템 정상</strong><span>{formatRelativeTime(updatedAt)} · {formatDateTime(updatedAt)}</span></div>
      </div>
    </header>
  );
}
