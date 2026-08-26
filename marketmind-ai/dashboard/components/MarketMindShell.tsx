import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime, formatRelativeTime } from "../format";
import { DashboardRefreshControl } from "./DashboardRefreshControl";

type ActivePage = "dashboard" | "futures" | "trading" | "news" | "project-center";

type MarketMindShellProps = {
  active: ActivePage;
  updatedAt: string;
  workerUpdatedAt?: string | null;
  children: ReactNode;
};

const navItems = [
  { id: "dashboard" as const, href: "/", icon: "▦", label: "대시보드" },
  { id: "futures" as const, href: "/futures", icon: "⇅", label: "선물 시장" },
  { id: "trading" as const, href: "/trading", icon: "◎", label: "모의 트레이딩" },
  { id: "news" as const, href: "/news", icon: "◫", label: "뉴스" },
  { id: "project-center" as const, href: "/project-center", icon: "⬡", label: "프로젝트 센터" },
];

export function MarketMindShell({ active, updatedAt, workerUpdatedAt = null, children }: MarketMindShellProps) {
  return (
    <main className="mm-app-shell">
      <aside className="mm-sidebar">
        <Link href="/" className="mm-side-brand" aria-label="MarketMind AI 홈">
          <img src="/marketmind-logo.svg" alt="" />
          <div>
            <strong>MarketMind <em>AI</em></strong>
            <span>BTC Intelligence Terminal</span>
          </div>
        </Link>

        <nav className="mm-side-nav" aria-label="MarketMind 메뉴">
          <span className="mm-nav-caption">MAIN</span>
          {navItems.map((item) => (
            <Link key={item.id} href={item.href} className={active === item.id ? "active" : ""}>
              <i aria-hidden="true">{item.icon}</i>
              <span>{item.label}</span>
            </Link>
          ))}
          <span className="mm-nav-caption mm-nav-caption-secondary">INTELLIGENCE</span>
          <span className="mm-nav-static"><i>◉</i><span>AI 분석</span><b>LIVE</b></span>
          <span className="mm-nav-static"><i>↗</i><span>시장 데이터</span><b>BTC</b></span>
          <span className="mm-nav-static"><i>⌁</i><span>포지션 관리</span></span>
          <span className="mm-nav-static"><i>⚙</i><span>설정</span></span>
        </nav>

        <div className="mm-sidebar-foot">
          <strong>MarketMind AI</strong>
          <span>BTC Intelligence Terminal</span>
          <small>© 2026 MarketMind AI</small>
        </div>
      </aside>

      <section className="mm-workspace">
        <header className="mm-brand-hero">
          <details className="mm-mobile-menu">
            <summary aria-label="전체 메뉴 열기"><span aria-hidden="true">☰</span></summary>
            <div className="mm-mobile-menu-backdrop" />
            <nav className="mm-mobile-menu-drawer" aria-label="MarketMind 모바일 전체 메뉴">
              <div className="mm-mobile-menu-head">
                <img src="/marketmind-logo.svg" alt="" />
                <div><strong>MarketMind <em>AI</em></strong><span>전체 메뉴</span></div>
              </div>
              <span className="mm-mobile-menu-caption">MAIN</span>
              {navItems.map((item) => (
                <Link key={`mobile-${item.id}`} href={item.href} className={active === item.id ? "active" : ""}>
                  <i aria-hidden="true">{item.icon}</i><span>{item.label}</span><b aria-hidden="true">›</b>
                </Link>
              ))}
              <span className="mm-mobile-menu-caption secondary">INTELLIGENCE</span>
              <div className="mm-mobile-menu-info"><i>◉</i><span>AI 분석</span><b>LIVE</b></div>
              <div className="mm-mobile-menu-info"><i>↗</i><span>시장 데이터</span><b>BTC</b></div>
            </nav>
          </details>

          <Link href="/" className="mm-hero-brand" aria-label="MarketMind AI 홈">
            <img src="/marketmind-logo.svg" alt="" />
            <div>
              <strong>MarketMind <em>AI</em></strong>
              <span>BTC Intelligence Terminal</span>
            </div>
          </Link>

          <div className="mm-hero-art" aria-hidden="true" />

          <div className="mm-hero-status">
            <span className="mm-status-pill green"><i/>Online</span>
            <span className="mm-status-pill cyan"><i/>Worker Online</span>
            <span className="mm-status-pill purple"><i/>AI Active</span>
            {active === "dashboard" ? <DashboardRefreshControl workerUpdatedAt={workerUpdatedAt} /> : null}
            <div className="mm-top-meta">
              <span>AI {formatRelativeTime(updatedAt)}</span>
              <small>{formatDateTime(updatedAt)}</small>
              <span className="mm-user-dot">M</span>
            </div>
          </div>
        </header>

        <div className="mm-content">{children}</div>
      </section>
    </main>
  );
}
