import { AdaptivePositionPlan } from "@/dashboard/components/AdaptivePositionPlan";
import { AiV2EntryPanel } from "@/dashboard/components/AiV2EntryPanel";
import { AiInsightPanel } from "@/dashboard/components/AiInsightPanel";
import { ComponentCards } from "@/dashboard/components/ComponentCards";
import { ConsensusPanel } from "@/dashboard/components/ConsensusPanel";
import { CurrentDecision } from "@/dashboard/components/CurrentDecision";
import { FixedAdaptiveBattlePanel } from "@/dashboard/components/FixedAdaptiveBattlePanel";
import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { LiveBitcoinChart } from "@/dashboard/components/LiveBitcoinChart";
import { MarketIntelligenceHero } from "@/dashboard/components/MarketIntelligenceHero";
import { MarketTicker } from "@/dashboard/components/MarketTicker";
import { ReasonPanel } from "@/dashboard/components/ReasonPanel";
import { RecentDecisions } from "@/dashboard/components/RecentDecisions";
import { SignalComposition } from "@/dashboard/components/SignalComposition";
import { getAdaptivePositionPlanData } from "@/dashboard/adaptive-position-data";
import { getFixedAdaptiveBattleData } from "@/dashboard/fixed-adaptive-battle-data";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";
import { getPaperTradingData } from "@/dashboard/paper-data";
import { getWorkerOperationsData } from "@/dashboard/worker-operations-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [marketData, dashboardData, workerData, adaptivePositionPlan, fixedAdaptiveBattle] = await Promise.all([
    getMarketIntelligenceDashboardData(),
    getPaperTradingData(),
    getWorkerOperationsData(),
    getAdaptivePositionPlanData(),
    getFixedAdaptiveBattleData(),
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
  const tradeExits = dashboardData.trades
    .filter((trade) => Boolean(trade.closed_at) && Number.isFinite(Number(trade.exit_price)))
    .map((trade) => ({
      closed_at: trade.closed_at,
      side: trade.side,
      exit_price: trade.exit_price,
      return_percent: trade.return_percent,
      close_reason: trade.close_reason,
    }))
    .sort((a, b) => new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime());

  const updatedAt =
    fixedAdaptiveBattle.analyzedAt ??
    adaptivePositionPlan.calculatedAt ??
    latestDecision?.decided_at ??
    marketData.latest?.calculated_at ??
    new Date().toISOString();
  const latestWorkerRun = workerData.runs[0] ?? null;
  const workerUpdatedAt = latestWorkerRun?.finished_at ?? latestWorkerRun?.started_at ?? null;

  return (
    <MarketMindShell active="dashboard" updatedAt={updatedAt} workerUpdatedAt={workerUpdatedAt}>
      <div className="terminal terminal-v2">

        {dashboardData.error ? <section className="notice notice-error"><strong>운영 데이터를 불러오지 못했습니다.</strong><span>{dashboardData.error}</span></section> : null}

        {latestDecision ? (
          <>
            <MarketTicker decision={latestDecision} funding={dashboardData.funding} positionSide={dashboardData.openPositions[0]?.side ?? null} positionCount={dashboardData.openPositions.length} />
            <section className="market-focus-grid">
              <LiveBitcoinChart entries={tradeEntries} exits={tradeExits} positions={dashboardData.openPositions} />
              <CurrentDecision decision={latestDecision} />
            </section>
            <AiV2EntryPanel data={dashboardData.decisionV2} />
            <AdaptivePositionPlan data={adaptivePositionPlan} />
            <section className="mm-analysis-row">
              <SignalComposition decision={latestDecision} />
              <AiInsightPanel decision={latestDecision} />
            </section>
          </>
        ) : marketData.latest ? (
          <>
            <section className="notice"><strong>Final Market AI 판단을 기다리고 있습니다.</strong><span>현재는 Market Intelligence 최신 결과를 대신 표시합니다.</span></section>
            <LiveBitcoinChart entries={tradeEntries} exits={tradeExits} positions={dashboardData.openPositions} />
            <MarketIntelligenceHero data={marketData.latest} />
            <AdaptivePositionPlan data={adaptivePositionPlan} />
            <ComponentCards breakdown={marketData.latest.breakdown} />
            <section className="analysis-grid"><ConsensusPanel votes={marketData.latest.direction_votes} /><ReasonPanel reasons={marketData.latest.reasons} /></section>
          </>
        ) : (
          <><LiveBitcoinChart entries={tradeEntries} exits={tradeExits} positions={dashboardData.openPositions} /><AdaptivePositionPlan data={adaptivePositionPlan} /><section className="panel empty-state"><div className="empty-mark"><img src="/marketmind-logo.svg" alt="" style={{width:"52px",height:"52px"}} /></div><h1>아직 생성된 AI 시장 판단이 없습니다.</h1><p>차트는 계속 표시되며, Market Worker 실행 후 AI 판단이 이 화면에 연결됩니다.</p></section></>
        )}

        <FixedAdaptiveBattlePanel data={fixedAdaptiveBattle} />

        {dashboardData.decisions.length > 0 ? (
          <section className="home-bottom-grid dashboard-recent-only">
            <RecentDecisions decisions={dashboardData.decisions.slice(0, 5)} />
          </section>
        ) : null}

        <footer className="terminal-footer"><span>MarketMind AI · BTC Intelligence</span><span>Paper Trading Only · No Live Trading</span></footer>
      </div>
    </MarketMindShell>
  );
}
