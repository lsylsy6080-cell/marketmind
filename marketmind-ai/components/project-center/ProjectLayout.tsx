import type { AiDecisionSnapshot } from "./AiDecisionMonitorCard";
import { AiDecisionMonitorCard } from "./AiDecisionMonitorCard";
import { AiDecisionHistoryCard } from "./AiDecisionHistoryCard";
import type { DevelopmentService } from "./DevelopmentStatusCard";
import { DevelopmentStatusCard } from "./DevelopmentStatusCard";
import styles from "./ProjectCenter.module.css";

type ProjectLayoutProps = {
  services: DevelopmentService[];
  checkedAt: string;
  healthError?: string;
  aiDecision: AiDecisionSnapshot | null;
  aiDecisionHistory: AiDecisionSnapshot[];
  aiDecisionSource: string;
  aiDecisionError?: string;
};

export default function ProjectLayout({
  services,
  checkedAt,
  healthError,
  aiDecision,
  aiDecisionHistory,
  aiDecisionSource,
  aiDecisionError,
}: ProjectLayoutProps) {
  const worker = services.find((service) => service.name === "Market Worker");
  const database = services.find((service) => service.name === "데이터베이스");
  const healthy = services.filter((service) => service.status === "healthy").length;

  return (
    <main className={styles.projectCenter}>
      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroScanline} aria-hidden="true" />

        <div className={styles.heroContent}>
          <div>
            <span className={styles.heroEyebrow}>MARKETMIND SYSTEM CENTER</span>
            <h1>프로젝트 <em>센터</em></h1>
            <p>
              개발 기록이 아니라 현재 MarketMind 엔진이 정상적으로 동작하는지만
              빠르게 확인합니다.
            </p>
          </div>

          <div className={styles.heroStatus}>
            <span className={styles.heroStatusDot} aria-hidden="true" />
            <div>
              <span>SYSTEM STATUS</span>
              <strong>{healthError ? "확인 필요" : healthy === services.length ? "정상 운영 중" : "일부 확인 필요"}</strong>
              <small>
                Worker {worker?.detail ?? "확인 중"} · DB {database?.detail ?? "확인 중"}
              </small>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.fullWidthSection} aria-label="시스템 상태">
        <DevelopmentStatusCard services={services} checkedAt={checkedAt} />
      </section>

      <section className={styles.aiDecisionGrid} aria-label="AI 판단 현황">
        <AiDecisionMonitorCard
          decision={aiDecision}
          checkedAt={checkedAt}
          source={aiDecisionSource}
          error={aiDecisionError}
        />
        <AiDecisionHistoryCard
          history={aiDecisionHistory}
          error={aiDecisionError}
        />
      </section>
    </main>
  );
}
