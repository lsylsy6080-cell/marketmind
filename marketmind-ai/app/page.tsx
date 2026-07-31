import { AiInsightPanel } from "@/dashboard/components/AiInsightPanel";
import { BacktestPanel } from "@/dashboard/components/BacktestPanel";
import { ComponentCards } from "@/dashboard/components/ComponentCards";
import { ConsensusPanel } from "@/dashboard/components/ConsensusPanel";
import { CurrentDecision } from "@/dashboard/components/CurrentDecision";
import { DashboardTopbar } from "@/dashboard/components/DashboardTopbar";
import { DecisionTimeline } from "@/dashboard/components/DecisionTimeline";
import { MarketIntelligenceHero } from "@/dashboard/components/MarketIntelligenceHero";
import { MarketTicker } from "@/dashboard/components/MarketTicker";
import { PaperTradingSummary } from "@/dashboard/components/PaperTradingSummary";
import { PerformanceOverview } from "@/dashboard/components/PerformanceOverview";
import { ReasonPanel } from "@/dashboard/components/ReasonPanel";
import { RecentDecisions } from "@/dashboard/components/RecentDecisions";
import { ScoreHistoryChart } from "@/dashboard/components/ScoreHistoryChart";
import { ScoreOverview } from "@/dashboard/components/ScoreOverview";
import { SignalComposition } from "@/dashboard/components/SignalComposition";
import { StrategyComparePanel } from "@/dashboard/components/StrategyComparePanel";
import { CandidateComparisonPanel } from "@/dashboard/components/CandidateComparisonPanel";
import { getCandidateComparisonData } from "@/dashboard/candidate-comparison-data";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";
import { getPaperTradingData } from "@/dashboard/paper-data";
import { getStrategyComparisonData } from "@/dashboard/strategy-compare-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    marketData,
    dashboardData,
    strategyComparison,
    candidateComparison,
  ] = await Promise.all([
    getMarketIntelligenceDashboardData(),
    getPaperTradingData(),
    getStrategyComparisonData(),
    getCandidateComparisonData(),
  ]);
  const latestDecision = dashboardData.decisions[0] ?? null;
  const chronologicalDecisions = [...dashboardData.decisions].reverse();
  const updatedAt =
    latestDecision?.decided_at ??
    marketData.latest?.calculated_at ??
    new Date().toISOString();

  return (
    <main className="page-shell">
      <div className="terminal">
        <DashboardTopbar active="dashboard" updatedAt={updatedAt} />

        <section className="page-heading">
          <div>
            <span className="section-kicker">MARKET OVERVIEW</span>
            <h1>시장 대시보드</h1>
            <p>
              Final Market AI 판단부터 모의매매·백테스트·성과까지 한 화면에서
              확인합니다.
            </p>
          </div>
        </section>

        {dashboardData.error ? (
          <section className="notice notice-error">
            <strong>운영 데이터를 불러오지 못했습니다.</strong>
            <span>{dashboardData.error}</span>
            <small>
              <code>.env.local</code>의 Supabase 설정과 Phase 3 테이블 적용
              상태를 확인해주세요.
            </small>
          </section>
        ) : null}

        {latestDecision ? (
          <>
            <MarketTicker
              decision={latestDecision}
              funding={dashboardData.funding}
            />

            <section className="hero-grid">
              <CurrentDecision decision={latestDecision} />
              <ScoreOverview decision={latestDecision} />
            </section>

            <AiInsightPanel decision={latestDecision} />
            <SignalComposition decision={latestDecision} />

            <section className="visualization-grid">
              <ScoreHistoryChart decisions={chronologicalDecisions} />
              <DecisionTimeline decisions={dashboardData.decisions.slice(0, 12)} />
            </section>

            <section className="analytics-grid">
              <BacktestPanel summary={dashboardData.backtestSummary} />
              <PerformanceOverview summary={dashboardData.performanceSummary} />
            </section>
          </>
        ) : marketData.latest ? (
          <>
            <section className="notice">
              <strong>Final Market AI 판단을 기다리고 있습니다.</strong>
              <span>
                현재는 Market Intelligence 최신 결과를 대신 표시합니다.
              </span>
            </section>
            <MarketIntelligenceHero data={marketData.latest} />
            <ComponentCards breakdown={marketData.latest.breakdown} />
            <section className="analysis-grid">
              <ConsensusPanel votes={marketData.latest.direction_votes} />
              <ReasonPanel reasons={marketData.latest.reasons} />
            </section>
          </>
        ) : (
          <section className="panel empty-state">
            <div className="empty-mark">MM</div>
            <h1>아직 생성된 시장 판단이 없습니다.</h1>
            <p>
              Market Worker를 실행하면 최신 Final Market AI 결과가 자동으로
              표시됩니다.
            </p>
          </section>
        )}

        <PaperTradingSummary data={dashboardData} />
        <StrategyComparePanel data={strategyComparison} />
        <CandidateComparisonPanel data={candidateComparison} />

        {dashboardData.decisions.length > 0 ? (
          <RecentDecisions decisions={dashboardData.decisions.slice(0, 10)} />
        ) : null}

        <footer className="terminal-footer">
          <span>MarketMind AI · Dashboard Phase 5-2</span>
          <span>Decision · Paper Trading · Backtest · Strategy Candidates</span>
        </footer>
      </div>
    </main>
  );
}
