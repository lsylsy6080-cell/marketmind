import styles from "./ProjectCenter.module.css";

export type ReleaseStage = "completed" | "current" | "planned";

export type ReleaseItem = {
  version: string;
  title: string;
  description: string;
  progress: number;
  stage: ReleaseStage;
};

type ReleaseTimelineCardProps = {
  releases?: ReleaseItem[];
};

const defaultReleases: ReleaseItem[] = [
  {
    version: "v1.0",
    title: "프로젝트 센터",
    description: "프로젝트 현황과 개발 로드맵 기반 구축",
    progress: 100,
    stage: "completed",
  },
  {
    version: "v1.2",
    title: "AI 운영센터",
    description: "완성도·상태·진행률·AI 제안 화면",
    progress: 100,
    stage: "current",
  },
  {
    version: "v2.0",
    title: "AI Decision Engine",
    description: "판단 엔진과 모의투자 시스템 연결",
    progress: 65,
    stage: "planned",
  },
  {
    version: "v2.5",
    title: "성과 분석",
    description: "전략별 성과와 모델 피드백 자동화",
    progress: 25,
    stage: "planned",
  },
  {
    version: "v3.0",
    title: "Autonomous AI",
    description: "자율 연구·검증·개선 운영 구조",
    progress: 5,
    stage: "planned",
  },
];

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

const stageLabel: Record<ReleaseStage, string> = {
  completed: "완료",
  current: "운영 중",
  planned: "예정",
};

export function ReleaseTimelineCard({
  releases = defaultReleases,
}: ReleaseTimelineCardProps) {
  return (
    <article
      className={`${styles.osCard} ${styles.timelineCard}`}
      aria-labelledby="release-timeline-title"
    >
      <div className={styles.timelineGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>RELEASE ROADMAP</span>
          <h2 id="release-timeline-title">릴리즈 타임라인</h2>
        </div>

        <span className={styles.timelineCount}>{releases.length} RELEASES</span>
      </div>

      <div className={styles.releaseTimeline}>
        {releases.map((release, index) => {
          const progress = normalizeProgress(release.progress);

          return (
            <div
              className={`${styles.releaseItem} ${
                release.stage === "current" ? styles.releaseCurrent : ""
              }`}
              key={release.version}
            >
              <div className={styles.releaseRail} aria-hidden="true">
                <span
                  className={`${styles.releaseNode} ${
                    release.stage === "completed"
                      ? styles.releaseNodeCompleted
                      : release.stage === "current"
                        ? styles.releaseNodeCurrent
                        : styles.releaseNodePlanned
                  }`}
                />
                {index < releases.length - 1 ? (
                  <i className={styles.releaseLine} />
                ) : null}
              </div>

              <div className={styles.releaseContent}>
                <div className={styles.releaseTop}>
                  <div>
                    <span className={styles.releaseVersion}>
                      {release.version}
                    </span>
                    <h3>{release.title}</h3>
                  </div>

                  <span
                    className={`${styles.releaseStage} ${
                      release.stage === "completed"
                        ? styles.releaseStageCompleted
                        : release.stage === "current"
                          ? styles.releaseStageCurrent
                          : styles.releaseStagePlanned
                    }`}
                  >
                    {stageLabel[release.stage]}
                  </span>
                </div>

                <p>{release.description}</p>

                <div className={styles.releaseProgressHeader}>
                  <span>진행률</span>
                  <strong>{progress}%</strong>
                </div>

                <div
                  className={styles.releaseProgressTrack}
                  role="progressbar"
                  aria-label={`${release.version} ${release.title} 진행률 ${progress}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
