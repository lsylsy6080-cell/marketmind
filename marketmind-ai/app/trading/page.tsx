import Link from "next/link";
import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { PaperTradingDashboard } from "@/dashboard/components/PaperTradingDashboard";
import { getPaperTradingData } from "@/dashboard/paper-data";

export const dynamic = "force-dynamic";

export default async function TradingPage() {
  const data = await getPaperTradingData();
  const updatedAt = data.runs[0]?.created_at ?? data.equity.at(-1)?.captured_at ?? new Date().toISOString();

  return (
    <MarketMindShell active="trading" updatedAt={updatedAt}>
      <div className="terminal">
        <section className="page-heading trading-page-heading">
          <div><span className="section-kicker">PAPER TRADING</span><h1>모의 트레이딩</h1><p>현재 포지션, 전략 실행, 손익과 거래 성과를 집중적으로 관리합니다.</p></div>
          <Link className="back-link" href="/">← 시장 대시보드로</Link>
        </section>
        <PaperTradingDashboard data={data} />
        <footer className="terminal-footer"><span>MarketMind AI · Trading v1</span><span>Paper Trading 전용 운영 화면</span></footer>
      </div>
    </MarketMindShell>
  );
}
