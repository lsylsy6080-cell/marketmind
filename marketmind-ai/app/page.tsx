import { AiInsightPanel } from "@/dashboard/components/AiInsightPanel";
import { ComponentCards } from "@/dashboard/components/ComponentCards";
import { ConsensusPanel } from "@/dashboard/components/ConsensusPanel";
import { CurrentDecision } from "@/dashboard/components/CurrentDecision";
import { DashboardTopbar } from "@/dashboard/components/DashboardTopbar";
import { LiveBitcoinChart } from "@/dashboard/components/LiveBitcoinChart";
import { MarketIntelligenceHero } from "@/dashboard/components/MarketIntelligenceHero";
import { MarketTicker } from "@/dashboard/components/MarketTicker";
import { PaperTradingSummary } from "@/dashboard/components/PaperTradingSummary";
import { ReasonPanel } from "@/dashboard/components/ReasonPanel";
import { RecentDecisions } from "@/dashboard/components/RecentDecisions";
import { SignalComposition } from "@/dashboard/components/SignalComposition";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";
import { getPaperTradingData } from "@/dashboard/paper-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [marketData, dashboardData] = await Promise.all([
    getMarketIntelligenceDashboardData(),
    getPaperTradingData(),
  ]);
  const latestDecision = dashboardData.decisions[0] ?? null;
  const tradeEntries = [
    ...dashboardData.openPositions.map((position) => ({
      opened_at: position.opened_at,
      side: position.side,
      entry_price: position.entry_price,
    })),
    ...dashboardData.trades.map((trade) => ({
      opened_at: trade.opened_at,
      side: trade.side,
      entry_price: trade.entry_price,
    })),
  ]
    .filter((entry, index, all) =>
      all.findIndex((candidate) =>
        candidate.opened_at === entry.opened_at &&
        candidate.side === entry.side &&
        candidate.entry_price === entry.entry_price
      ) === index
    )
    .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
  const updatedAt = latestDecision?.decided_at ?? marketData.latest?.calculated_at ?? new Date().toISOString();

  return (
    <main className="page-shell">
      <div className="terminal terminal-v2">
        <DashboardTopbar active="dashboard" updatedAt={updatedAt} />

        <section className="page-heading compact-heading">
          <div>
            <span className="section-kicker">BTC INTELLIGENCE TERMINAL</span>
            <h1>시장 대시보드</h1>
            <p>BTC 가격 흐름과 현재 AI 판단에 집중한 실시간 운영 화면입니다.</p>
          </div>
        </section>

        {dashboardData.error ? <section className="notice notice-error"><strong>운영 데이터를 불러오지 못했습니다.</strong><span>{dashboardData.error}</span></section> : null}

        {latestDecision ? (
          <>
            <MarketTicker decision={latestDecision} funding={dashboardData.funding} />
            <section className="market-focus-grid">
              <LiveBitcoinChart entries={tradeEntries} />
              <CurrentDecision decision={latestDecision} />
            </section>
            <SignalComposition decision={latestDecision} />
            <AiInsightPanel decision={latestDecision} />
          </>
        ) : marketData.latest ? (
          <>
            <section className="notice"><strong>Final Market AI 판단을 기다리고 있습니다.</strong><span>현재는 Market Intelligence 최신 결과를 대신 표시합니다.</span></section>
            <LiveBitcoinChart entries={tradeEntries} />
            <MarketIntelligenceHero data={marketData.latest} />
            <ComponentCards breakdown={marketData.latest.breakdown} />
            <section className="analysis-grid"><ConsensusPanel votes={marketData.latest.direction_votes} /><ReasonPanel reasons={marketData.latest.reasons} /></section>
          </>
        ) : (
          <><LiveBitcoinChart entries={tradeEntries} /><section className="panel empty-state"><div className="empty-mark">MM</div><h1>아직 생성된 AI 시장 판단이 없습니다.</h1><p>차트는 계속 표시되며, Market Worker 실행 후 AI 판단이 이 화면에 연결됩니다.</p></section></>
        )}

        <section className="home-bottom-grid">
          <PaperTradingSummary data={dashboardData} />
          {dashboardData.decisions.length > 0 ? <RecentDecisions decisions={dashboardData.decisions.slice(0, 5)} /> : null}
        </section>

        <footer className="terminal-footer"><span>MarketMind AI · BTC Intelligence</span><span>Paper Trading Only · No Live Trading</span></footer>
      </div>
    </main>
  );
}
