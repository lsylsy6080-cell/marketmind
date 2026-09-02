import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { OverviewDashboard } from "@/dashboard/components/OverviewDashboard";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";
import { getHomePaperTradingData } from "@/dashboard/paper-data";
import { getWorkerOperationsData } from "@/dashboard/worker-operations-data";
import { getNewsPageData } from "@/dashboard/news-data";
import { getLongTermTrendData } from "@/dashboard/long-term-trend-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [marketData, dashboardData, workerData, newsData, trendData] = await Promise.all([
    getMarketIntelligenceDashboardData(),
    getHomePaperTradingData(),
    getWorkerOperationsData(),
    getNewsPageData(),
    getLongTermTrendData(),
  ]);
  const latestDecision = dashboardData.decisions[0] ?? null;
  const latestWorkerRun = workerData.runs[0] ?? null;
  const workerUpdatedAt = latestWorkerRun?.finished_at ?? latestWorkerRun?.started_at ?? null;
  const updatedAt = latestDecision?.decided_at ?? trendData.latest?.snapshot_hour ?? marketData.latest?.calculated_at ?? new Date().toISOString();
  return <MarketMindShell active="dashboard" updatedAt={updatedAt} workerUpdatedAt={workerUpdatedAt}>
    <div className="terminal terminal-v2 mock-terminal">
      <OverviewDashboard dashboard={dashboardData} market={marketData.latest} news={newsData} trend={trendData.latest} workerUpdatedAt={workerUpdatedAt}/>
    </div>
  </MarketMindShell>;
}
