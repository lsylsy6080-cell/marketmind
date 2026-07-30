import { getDashboardData } from "../dashboard/data";
import { AiInsightPanel } from "../dashboard/components/AiInsightPanel";
import { BacktestHeatmap } from "../dashboard/components/BacktestHeatmap";
import { CurrentDecision } from "../dashboard/components/CurrentDecision";
import { DashboardHeader } from "../dashboard/components/DashboardHeader";
import { DecisionTimeline } from "../dashboard/components/DecisionTimeline";
import { MarketTicker } from "../dashboard/components/MarketTicker";
import { PerformanceOverview } from "../dashboard/components/PerformanceOverview";
import { PaperTradingDashboard } from "../dashboard/components/PaperTradingDashboard";
import { RecentDecisions } from "../dashboard/components/RecentDecisions";
import { ScoreHistoryChart } from "../dashboard/components/ScoreHistoryChart";
import { SignalComposition } from "../dashboard/components/SignalComposition";
import { TerminalFooter } from "../dashboard/components/TerminalFooter";
import { TerminalNavigation } from "../dashboard/components/TerminalNavigation";
import { StrategyComparePanel } from "../dashboard/components/StrategyComparePanel";
import { getStrategyComparisonData } from "../dashboard/strategy-compare-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [data, strategyComparison] = await Promise.all([
    getDashboardData(),
    getStrategyComparisonData(),
  ]);

  return (
    <main className="page-shell">
      <div className="terminal">
        <TerminalNavigation />
        <DashboardHeader latestDecision={data.latestDecision} />
        <PaperTradingDashboard data={data.paperTrading} />
        <StrategyComparePanel data={strategyComparison} />

        {data.error ? (
          <section className="notice notice-error">
            <strong>일부 데이터를 불러오지 못했습니다.</strong>
            <span>{data.error}</span>
          </section>
        ) : null}

        {!data.latestDecision ? (
          <section className="empty-state">
            <div className="empty-mark">MM</div>
            <h1>아직 생성된 시장 판단이 없습니다.</h1>
            <p>
              Worker가 실행되어 <code>final_market_decisions</code>에 데이터가
              저장되면 화면이 자동으로 채워집니다.
            </p>
          </section>
        ) : (
          <>
            <MarketTicker
              decision={data.latestDecision}
              funding={data.latestFunding}
            />

            <section className="hero-grid">
              <CurrentDecision decision={data.latestDecision} />
              <SignalComposition decision={data.latestDecision} />
            </section>

            <AiInsightPanel decision={data.latestDecision} />

            <section className="visualization-grid">
              <ScoreHistoryChart decisions={data.chartDecisions} />
              <DecisionTimeline decisions={data.timelineDecisions} />
            </section>

            <section className="analytics-grid">
              <BacktestHeatmap
                backtests={data.recentBacktests}
                latestDecisionId={data.latestDecision.id}
              />
              <PerformanceOverview summary={data.performanceSummary} />
            </section>

            <RecentDecisions decisions={data.recentDecisions} />

            <TerminalFooter
              latestDecision={data.latestDecision}
              performance={data.performanceSummary}
            />
          </>
        )}
      </div>
    </main>
  );
}
