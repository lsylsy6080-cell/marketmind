import { ComponentCards } from "@/dashboard/components/ComponentCards";
import { ConsensusPanel } from "@/dashboard/components/ConsensusPanel";
import { DashboardTopbar } from "@/dashboard/components/DashboardTopbar";
import { HistoryTable } from "@/dashboard/components/HistoryTable";
import { MarketIntelligenceHero } from "@/dashboard/components/MarketIntelligenceHero";
import { ReasonPanel } from "@/dashboard/components/ReasonPanel";
import { getMarketIntelligenceDashboardData } from "@/dashboard/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getMarketIntelligenceDashboardData();

  return (
    <main className="page-shell">
      <div className="terminal">
        <DashboardTopbar updatedAt={data.latest?.calculated_at ?? new Date().toISOString()} />

        {data.error ? (
          <section className="notice notice-error">
            <strong>Market Intelligence 데이터를 불러오지 못했습니다.</strong>
            <span>{data.error}</span>
            <small><code>.env.local</code>의 SUPABASE_SECRET_KEY와 SQL/RLS 설정을 확인해주세요.</small>
          </section>
        ) : null}

        {!data.latest ? (
          <section className="panel empty-state">
            <div className="empty-mark">MM</div>
            <h1>아직 생성된 시장 분석이 없습니다.</h1>
            <p>Worker에서 <code>npm run intelligence:run</code>을 실행하면 <code>market_intelligence_scores</code> 최신 결과가 여기에 표시됩니다.</p>
          </section>
        ) : (
          <>
            <MarketIntelligenceHero data={data.latest} />
            <ComponentCards breakdown={data.latest.breakdown} />
            <section className="analysis-grid">
              <ConsensusPanel votes={data.latest.direction_votes} />
              <ReasonPanel reasons={data.latest.reasons} />
            </section>
            <HistoryTable rows={data.history} />
            <footer className="terminal-footer">
              <span>MarketMind AI · Market Intelligence v2.1</span>
              <span>{data.latest.component_count ?? 0}개 지표 반영 · 자동 새로고침은 페이지 갱신 시 적용</span>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
