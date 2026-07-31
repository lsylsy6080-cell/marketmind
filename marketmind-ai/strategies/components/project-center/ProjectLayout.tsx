import type { ActivityItem } from "./ActivityFeedCard";
import { ActivityFeedCard } from "./ActivityFeedCard";
import type { AiDecisionSnapshot } from "./AiDecisionMonitorCard";
import { AiDecisionMonitorCard } from "./AiDecisionMonitorCard";
import { AiDecisionHistoryCard } from "./AiDecisionHistoryCard";
import { AiSuggestionCard } from "./AiSuggestionCard";
import type { BuildSummary } from "./BuildCenterCard";
import { BuildCenterCard } from "./BuildCenterCard";
import type { DevelopmentService } from "./DevelopmentStatusCard";
import { DevelopmentStatusCard } from "./DevelopmentStatusCard";
import type { GitCommitItem } from "./GitTimelineCard";
import { GitTimelineCard } from "./GitTimelineCard";
import { ProgressCard } from "./ProgressCard";
import { ProjectScoreCard } from "./ProjectScoreCard";
import { ReleaseTimelineCard } from "./ReleaseTimelineCard";
import styles from "./ProjectCenter.module.css";

type ProjectLayoutProps = {
  services: DevelopmentService[];
  activities: ActivityItem[];
  checkedAt: string;
  healthError?: string;
  repository: string;
  branch: string;
  commits: GitCommitItem[];
  gitError?: string;
  build: BuildSummary | null;
  buildError?: string;
  aiDecision: AiDecisionSnapshot | null;
  aiDecisionHistory: AiDecisionSnapshot[];
  aiDecisionSource: string;
  aiDecisionError?: string;
};

const projectStats = [
  { label: "현재 릴리즈", value: "v3.1", description: "AI Brain Dashboard" },
  { label: "운영 모드", value: "LIVE", description: "실시간 프로젝트 현황" },
  { label: "다음 목표", value: "v3.2", description: "Paper Trading Live" },
];

const focusItems = [
  {
    index: "01",
    title: "AI Decision Engine",
    description:
      "시장 인텔리전스 결과를 LONG·SHORT·WAIT 신호로 변환하는 의사결정 계층을 구축합니다.",
    tag: "구현 완료",
  },
  {
    index: "02",
    title: "Paper Trading Live",
    description:
      "AI 판단과 모의 포지션을 실시간으로 연결하고 손익과 리스크를 추적합니다.",
    tag: "다음 개발",
  },
  {
    index: "03",
    title: "Performance Analysis",
    description:
      "거래 결과와 판단 근거를 비교해 모델 개선 피드백을 자동 생성합니다.",
    tag: "후속 단계",
  },
];

export default function ProjectLayout({
  services,
  activities,
  checkedAt,
  healthError,
  repository,
  branch,
  commits,
  gitError,
  build,
  buildError,
  aiDecision,
  aiDecisionHistory,
  aiDecisionSource,
  aiDecisionError,
}: ProjectLayoutProps) {
  return (
    <main className={styles.projectCenter}>
      <section className={styles.hero}>
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.heroScanline} aria-hidden="true" />

        <div className={styles.heroContent}>
          <div>
            <span className={styles.heroEyebrow}>
              MARKETMIND OPERATING INTELLIGENCE
            </span>
            <h1>
              MarketMind AI <em>OS</em>
            </h1>
            <p>
              시스템 상태와 Git 커밋, AI 시장 판단을 하나의 프로젝트
              운영센터에서 확인합니다.
            </p>
            <div className={styles.heroCommand}>
              <span aria-hidden="true">&gt;</span>
              <code>project-center --mode live --release v3.1</code>
            </div>
          </div>

          <div className={styles.heroStatus}>
            <span className={styles.heroStatusDot} aria-hidden="true" />
            <div>
              <span>PROJECT STATUS</span>
              <strong>{healthError ? "일부 확인 필요" : "운영 데이터 연결"}</strong>
              <small>{healthError ?? `${repository} · ${branch}`}</small>
            </div>
          </div>
        </div>

        <div className={styles.heroStats}>
          {projectStats.map((stat) => (
            <div key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.description}</small>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.primaryGrid} aria-label="프로젝트 핵심 현황">
        <ProjectScoreCard
          score={94}
          version="3.1"
          phase="AI Brain Dashboard"
        />
        <DevelopmentStatusCard services={services} checkedAt={checkedAt} />
      </section>

      <section className={styles.fullWidthSection}>
        <ProgressCard />
      </section>

      <section className={styles.remasterGrid}>
        <AiSuggestionCard />
        <ReleaseTimelineCard />
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

      <section className={styles.fullWidthSection}>
        <ActivityFeedCard activities={activities} checkedAt={checkedAt} />
      </section>

      <section
        className={styles.developmentGrid}
        aria-label="Git 및 배포 현황"
      >
        <GitTimelineCard
          repository={repository}
          branch={branch}
          commits={commits}
          error={gitError}
        />
        <BuildCenterCard build={build ?? undefined} error={buildError} />
      </section>

      <section className={styles.focusSection} aria-labelledby="focus-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.cardEyebrow}>NEXT DEVELOPMENT FOCUS</span>
            <h2 id="focus-title">다음 개발 목표</h2>
          </div>
          <p>
            AI 판단 모니터 연결 이후 Paper Trading과 성과 분석 계층으로
            확장합니다.
          </p>
        </div>

        <div className={styles.focusGrid}>
          {focusItems.map((item) => (
            <article className={styles.focusCard} key={item.index}>
              <div className={styles.focusCardTop}>
                <span>{item.index}</span>
                <strong>{item.tag}</strong>
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
