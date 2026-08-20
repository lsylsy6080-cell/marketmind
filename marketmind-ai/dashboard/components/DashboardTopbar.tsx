import Link from "next/link";
import { formatDateTime, formatRelativeTime } from "../format";

type DashboardTopbarProps = {
  updatedAt: string;
  active?: "dashboard" | "trading" | "project-center";
};

export function DashboardTopbar({ updatedAt, active = "dashboard" }: DashboardTopbarProps) {
  return (
    <header className="topbar">
      <Link href="/" className="brand-block" aria-label="MarketMind AI 홈">
        <img className="brand-logo" src="/marketmind-logo.svg" alt="" />
        <div className="brand-copy">
          <strong>MarketMind <em>AI</em></strong>
          <span>BTC Intelligence Terminal</span>
        </div>
      </Link>

      <nav className="main-nav" aria-label="주요 메뉴">
        <Link className={active === "dashboard" ? "active" : ""} href="/">시장 대시보드</Link>
        <Link className={active === "trading" ? "active" : ""} href="/trading">모의 트레이딩</Link>
        <Link className={active === "project-center" ? "active" : ""} href="/project-center">프로젝트 센터</Link>
      </nav>

      <div className="topbar-status">
        <span className="live-dot" />
        <div><strong>ONLINE</strong><span>{formatRelativeTime(updatedAt)} · {formatDateTime(updatedAt)}</span></div>
      </div>
    </header>
  );
}
