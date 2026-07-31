import styles from "./ProjectCenter.module.css";

export type ProjectProgressItem = {
  name: string;
  value: number;
  status: string;
  description?: string;
};

type ProgressCardProps = {
  items?: ProjectProgressItem[];
};

const defaultItems: ProjectProgressItem[] = [
  {
    name: "프론트엔드",
    value: 100,
    status: "완료",
    description: "대시보드 및 프로젝트 센터",
  },
  {
    name: "백엔드",
    value: 95,
    status: "안정",
    description: "API·데이터 수집·Paper Trading V2",
  },
  {
    name: "AI 분석",
    value: 94,
    status: "고도화",
    description: "Decision Engine Phase 2 완료",
  },
  {
    name: "모의투자",
    value: 100,
    status: "완료",
    description: "다중 전략·위험관리·성과 연동",
  },
  {
    name: "수집 워커",
    value: 100,
    status: "운영 중",
    description: "펀딩비·ETF·뉴스 자동 수집",
  },
];

function normalizeProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function getProgressTone(value: number) {
  if (value >= 90) return styles.progressExcellent;
  if (value >= 70) return styles.progressGood;
  if (value >= 45) return styles.progressDeveloping;
  return styles.progressStarting;
}

export function ProgressCard({
  items = defaultItems,
}: ProgressCardProps) {
  const average =
    items.length > 0
      ? Math.round(
          items.reduce((sum, item) => sum + normalizeProgress(item.value), 0) /
            items.length,
        )
      : 0;

  return (
    <article
      className={`${styles.osCard} ${styles.progressCard}`}
      aria-labelledby="project-progress-title"
    >
      <div className={styles.cardGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>DEVELOPMENT PROGRESS</span>
          <h2 id="project-progress-title">개발 진행률</h2>
        </div>

        <div className={styles.averageProgress}>
          <span>평균</span>
          <strong>{average}%</strong>
        </div>
      </div>

      <div className={styles.progressList}>
        {items.map((item) => {
          const value = normalizeProgress(item.value);

          return (
            <div className={styles.progressItem} key={item.name}>
              <div className={styles.progressItemHeader}>
                <div>
                  <strong>{item.name}</strong>
                  {item.description ? <p>{item.description}</p> : null}
                </div>

                <div className={styles.progressValue}>
                  <span>{item.status}</span>
                  <strong>{value}%</strong>
                </div>
              </div>

              <div
                className={styles.progressTrack}
                role="progressbar"
                aria-label={`${item.name} 진행률 ${value}%`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
              >
                <span
                  className={getProgressTone(value)}
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
