import styles from "./ProjectCenter.module.css";

type ProjectScoreCardProps = {
  score: number;
  version: string;
  phase?: string;
};

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function getScoreMeta(score: number) {
  if (score >= 90) {
    return {
      label: "배포 준비 단계",
      description: "핵심 기능의 완성도가 높으며 다음 릴리즈 준비가 가능한 상태입니다.",
      tone: "excellent",
      stars: 5,
    } as const;
  }

  if (score >= 75) {
    return {
      label: "안정화 단계",
      description: "주요 기능은 구현되었으며 품질 개선과 검증이 필요한 상태입니다.",
      tone: "good",
      stars: 4,
    } as const;
  }

  if (score >= 50) {
    return {
      label: "개발 진행 중",
      description: "핵심 기능을 구축하고 있으며 단계별 구현이 진행 중입니다.",
      tone: "developing",
      stars: 3,
    } as const;
  }

  return {
    label: "초기 구축 단계",
    description: "프로젝트 기반 구조와 핵심 기능을 우선 구축해야 합니다.",
    tone: "starting",
    stars: 2,
  } as const;
}

export function ProjectScoreCard({
  score,
  version,
  phase = "MarketMind AI",
}: ProjectScoreCardProps) {
  const normalizedScore = clampScore(score);
  const meta = getScoreMeta(normalizedScore);
  const circumference = 2 * Math.PI * 52;
  const dashOffset = circumference - (normalizedScore / 100) * circumference;

  return (
    <article
      className={`${styles.osCard} ${styles.scoreCard}`}
      aria-labelledby="project-score-title"
    >
      <div className={styles.cardGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>PROJECT READINESS</span>
          <h2 id="project-score-title">프로젝트 완성도</h2>
        </div>

        <span className={styles.versionBadge}>v{version}</span>
      </div>

      <div className={styles.scoreContent}>
        <div
          className={styles.scoreGauge}
          role="progressbar"
          aria-label={`프로젝트 완성도 ${normalizedScore}%`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={normalizedScore}
        >
          <svg
            className={styles.scoreGaugeSvg}
            viewBox="0 0 120 120"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="project-score-gradient" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c4a7ff" />
                <stop offset="52%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#5b37d6" />
              </linearGradient>
            </defs>

            <circle
              className={styles.scoreGaugeTrack}
              cx="60"
              cy="60"
              r="52"
            />

            <circle
              className={styles.scoreGaugeProgress}
              cx="60"
              cy="60"
              r="52"
              pathLength={circumference}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>

          <div className={styles.scoreGaugeValue}>
            <strong>{normalizedScore}</strong>
            <span>%</span>
          </div>
        </div>

        <div className={styles.scoreDetails}>
          <div className={styles.scoreStatusRow}>
            <span
              className={`${styles.scoreStatusBadge} ${styles[`scoreTone${meta.tone}`]}`}
            >
              <i aria-hidden="true" />
              {meta.label}
            </span>

            <span className={styles.scorePhase}>{phase}</span>
          </div>

          <div
            className={styles.scoreStars}
            aria-label={`완성도 평가 별 ${meta.stars}개`}
          >
            {Array.from({ length: 5 }, (_, index) => (
              <span
                className={
                  index < meta.stars
                    ? styles.scoreStarActive
                    : styles.scoreStarInactive
                }
                aria-hidden="true"
                key={index}
              >
                ★
              </span>
            ))}
          </div>

          <p className={styles.scoreDescription}>{meta.description}</p>

          <div className={styles.scoreProgressMeta}>
            <span>전체 개발 진행률</span>
            <strong>{normalizedScore}%</strong>
          </div>

          <div className={styles.scoreProgressTrack} aria-hidden="true">
            <span style={{ width: `${normalizedScore}%` }} />
          </div>

          <div className={styles.scoreFooter}>
            <div>
              <span>현재 버전</span>
              <strong>v{version}</strong>
            </div>

            <div>
              <span>운영 단계</span>
              <strong>{meta.label}</strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
