import { AiInsightPanel } from "@/dashboard/components/AiInsightPanel";
import { CurrentDecision } from "@/dashboard/components/CurrentDecision";
import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { LiveBitcoinChart } from "@/dashboard/components/LiveBitcoinChart";
import { MarketIntelligenceHero } from "@/dashboard/components/MarketIntelligenceHero";
import { MarketTicker } from "@/dashboard/components/MarketTicker";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";
import { getHomePaperTradingData } from "@/dashboard/paper-data";
import { getWorkerOperationsData } from "@/dashboard/worker-operations-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [marketData, dashboardData, workerData] = await Promise.all([
    getMarketIntelligenceDashboardData(),
    getHomePaperTradingData(),
    getWorkerOperationsData(),
  ]);

  const latestDecision = dashboardData.decisions[0] ?? null;
  const latestWorkerRun = workerData.runs[0] ?? null;
  const workerUpdatedAt = latestWorkerRun?.finished_at ?? latestWorkerRun?.started_at ?? null;
  const updatedAt =
    latestDecision?.decided_at ??
    marketData.latest?.calculated_at ??
    new Date().toISOString();

  return (
    <MarketMindShell active="dashboard" updatedAt={updatedAt} workerUpdatedAt={workerUpdatedAt}>
      <div className="terminal terminal-v2 dashboard-clean">
        {dashboardData.error ? (
          <section className="notice notice-error">
            <strong>운영 데이터를 불러오지 못했습니다.</strong>
            <span>{dashboardData.error}</span>
          </section>
        ) : null}

        {latestDecision ? (
          <>
            <MarketTicker
              decision={latestDecision}
              funding={dashboardData.funding}
              positionSide={dashboardData.openPositions[0]?.side ?? null}
              positionCount={dashboardData.openPositions.length}
            />
            <section className="market-focus-grid dashboard-primary-grid">
              <LiveBitcoinChart positions={dashboardData.openPositions} />
              <CurrentDecision decision={latestDecision} />
            </section>
            <section className="dashboard-insight-only">
              <AiInsightPanel decision={latestDecision} />
            </section>
          </>
        ) : marketData.latest ? (
          <>
            <section className="notice">
              <strong>Final Market AI 판단을 기다리고 있습니다.</strong>
              <span>현재는 Market Intelligence 최신 결과를 대신 표시합니다.</span>
            </section>
            <LiveBitcoinChart positions={dashboardData.openPositions} />
            <MarketIntelligenceHero data={marketData.latest} />
          </>
        ) : (
          <>
            <LiveBitcoinChart positions={dashboardData.openPositions} />
            <section className="panel empty-state">
              <div className="empty-mark">
                <img src="/marketmind-logo.svg" alt="" style={{ width: "52px", height: "52px" }} />
              </div>
              <h1>아직 생성된 AI 시장 판단이 없습니다.</h1>
              <p>차트는 계속 표시되며, Market Worker 실행 후 AI 판단이 이 화면에 연결됩니다.</p>
            </section>
          </>
        )}

        <footer className="terminal-footer">
          <span>MarketMind AI · BTC Intelligence</span>
          <span>Paper Trading Only · No Live Trading</span>
        </footer>
      </div>
    </MarketMindShell>
  );
}
