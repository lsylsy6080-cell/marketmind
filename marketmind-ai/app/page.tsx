import { ComponentCards } from "@/dashboard/components/ComponentCards";
import { ConsensusPanel } from "@/dashboard/components/ConsensusPanel";
import { DashboardTopbar } from "@/dashboard/components/DashboardTopbar";
import { HistoryTable } from "@/dashboard/components/HistoryTable";
import { MarketIntelligenceHero } from "@/dashboard/components/MarketIntelligenceHero";
import { PaperTradingSummary } from "@/dashboard/components/PaperTradingSummary";
import { ReasonPanel } from "@/dashboard/components/ReasonPanel";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";
import { getPaperTradingData } from "@/dashboard/paper-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [marketData, paperTrading] = await Promise.all([
    getMarketIntelligenceDashboardData(),
    getPaperTradingData(),
  ]);

  return (
    <main className="page-shell">
      <div className="terminal">
        <DashboardTopbar active="dashboard" updatedAt={marketData.latest?.calculated_at ?? new Date().toISOString()} />

        <section className="page-heading">
          <div><span className="section-kicker">MARKET OVERVIEW</span><h1>시장 대시보드</h1><p>Market Intelligence의 최신 판단과 핵심 근거를 한눈에 확인합니다.</p></div>
        </section>

        {marketData.error ? (
          <section className="notice notice-error"><strong>Market Intelligence 데이터를 불러오지 못했습니다.</strong><span>{marketData.error}</span><small><code>.env.local</code>의 SUPABASE_SECRET_KEY와 SQL/RLS 설정을 확인해주세요.</small></section>
        ) : null}

        {!marketData.latest ? (
          <section className="panel empty-state"><div className="empty-mark">MM</div><h1>아직 생성된 시장 분석이 없습니다.</h1><p>Worker에서 <code>npm run intelligence:run</code>을 실행하면 <code> market_intelligence_scores</code> 최신 결과가 표시됩니다.</p></section>
        ) : (
          <>
            <MarketIntelligenceHero data={marketData.latest} />
            <ComponentCards breakdown={marketData.latest.breakdown} />
            <section className="analysis-grid"><ConsensusPanel votes={marketData.latest.direction_votes} /><ReasonPanel reasons={marketData.latest.reasons} /></section>
          </>
        )}

        <PaperTradingSummary data={paperTrading} />
        {marketData.latest ? <HistoryTable rows={marketData.history} /> : null}

        <footer className="terminal-footer"><span>MarketMind AI · Dashboard v2</span><span>시장 분석과 Paper Trading을 분리한 운영 구조</span></footer>
      </div>
    </main>
  );
}
