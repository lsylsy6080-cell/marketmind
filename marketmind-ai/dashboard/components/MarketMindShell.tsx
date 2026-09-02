import Link from "next/link";
import type { ReactNode } from "react";
import { ShellMarketStatus } from "./ShellMarketStatus";

type ActivePage = "dashboard" | "futures" | "trading" | "news" | "trend" | "onchain" | "settings";

type MarketMindShellProps = {
  active: ActivePage;
  updatedAt: string;
  workerUpdatedAt?: string | null;
  children: ReactNode;
};

const navItems = [
  { id: "dashboard" as const, href: "/", icon: "▦", label: "대시보드" },
  { id: "futures" as const, href: "/futures", icon: "↗", label: "선물시장" },
  { id: "trading" as const, href: "/trading", icon: "◎", label: "모의매매" },
  { id: "news" as const, href: "/news", icon: "▤", label: "뉴스" },
  { id: "trend" as const, href: "/trend", icon: "〽", label: "장기추세" },
  { id: "onchain" as const, href: "/onchain", icon: "⌁", label: "온체인" },
  { id: "settings" as const, href: "/settings", icon: "⚙", label: "설정" },
];

const pageTitle: Record<ActivePage, string> = {
  dashboard: "대시보드",
  futures: "선물시장",
  trading: "모의매매",
  news: "뉴스",
  trend: "장기추세",
  onchain: "온체인",
  settings: "설정",
};

export function MarketMindShell({ active, updatedAt, workerUpdatedAt = null, children }: MarketMindShellProps) {
  return (
    <main className="mm-app-shell mm-mockup-shell">
      <aside className="mm-sidebar mm-mockup-sidebar">
        <Link href="/" className="mm-side-brand" aria-label="MarketMind AI 홈">
          <img src="/marketmind-logo.svg" alt="" />
          <strong>MarketMind AI</strong>
        </Link>

        <nav className="mm-side-nav" aria-label="MarketMind 메뉴">
          {navItems.map((item) => (
            <Link key={item.id} href={item.href} className={active === item.id ? "active" : ""}>
              <i aria-hidden="true">{item.icon}</i>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="mm-server-card">
          <div><span className="server-gem">◆</span><strong>Server Mode</strong></div>
          <small>Buddy4 · PM2 Worker</small>
          <Link href="/settings">상태 관리 <b>›</b></Link>
        </div>
      </aside>

      <section className="mm-workspace mm-mockup-workspace">
        <header className="mm-mockup-topbar">
          <details className="mm-mobile-menu">
            <summary aria-label="전체 메뉴 열기"><span aria-hidden="true">☰</span></summary>
            <div className="mm-mobile-menu-backdrop" />
            <nav className="mm-mobile-menu-drawer" aria-label="MarketMind 모바일 전체 메뉴">
              <div className="mm-mobile-menu-head"><img src="/marketmind-logo.svg" alt="" /><div><strong>MarketMind AI</strong><span>전체 메뉴</span></div></div>
              {navItems.map((item) => (
                <Link key={`mobile-${item.id}`} href={item.href} className={active === item.id ? "active" : ""}>
                  <i aria-hidden="true">{item.icon}</i><span>{item.label}</span><b aria-hidden="true">›</b>
                </Link>
              ))}
            </nav>
          </details>
          <h1>{pageTitle[active]}</h1>
          <div className="mm-topbar-center"><ShellMarketStatus updatedAt={updatedAt} workerUpdatedAt={workerUpdatedAt} /></div>
        </header>
        <div className="mm-content mm-mockup-content">{children}</div>
      </section>
    </main>
  );
}
