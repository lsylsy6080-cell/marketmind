import styles from "./ProjectCenter.module.css";

export type AiSuggestion = {
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  confidence: number;
  impact: string;
  estimate: string;
  release: string;
  checklist: string[];
};

type AiSuggestionCardProps = {
  suggestion?: AiSuggestion;
};

const defaultSuggestion: AiSuggestion = {
  title: "AI Decision Engine",
  description:
    "시장 인텔리전스 결과를 매매 방향·신뢰도·리스크 수준으로 변환하는 의사결정 계층을 우선 구축하는 것을 권장합니다.",
  priority: "HIGH",
  confidence: 94,
  impact: "+18%",
  estimate: "3~4시간",
  release: "v2.0",
  checklist: [
    "통합 시장 점수 입력 구조 정의",
    "LONG·SHORT·WAIT 판단 규칙 구현",
    "판단 근거와 신뢰도 저장",
  ],
};

function normalizePercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function AiSuggestionCard({
  suggestion = defaultSuggestion,
}: AiSuggestionCardProps) {
  const confidence = normalizePercent(suggestion.confidence);

  return (
    <article
      className={`${styles.osCard} ${styles.aiSuggestionCard}`}
      aria-labelledby="ai-suggestion-title"
    >
      <div className={styles.aiCardGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>AI RECOMMENDATION</span>
          <h2 id="ai-suggestion-title">AI 개발 제안</h2>
        </div>

        <span
          className={`${styles.priorityBadge} ${
            suggestion.priority === "HIGH"
              ? styles.priorityHigh
              : suggestion.priority === "MEDIUM"
                ? styles.priorityMedium
                : styles.priorityLow
          }`}
        >
          {suggestion.priority}
        </span>
      </div>

      <div className={styles.aiSuggestionBody}>
        <div className={styles.aiRecommendationHeader}>
          <div className={styles.aiOrb} aria-hidden="true">
            <span />
            <i />
          </div>

          <div>
            <span className={styles.recommendationLabel}>추천 작업</span>
            <h3>{suggestion.title}</h3>
          </div>
        </div>

        <p className={styles.aiRecommendationDescription}>
          {suggestion.description}
        </p>

        <div className={styles.confidenceBlock}>
          <div className={styles.confidenceHeader}>
            <span>AI 신뢰도</span>
            <strong>{confidence}%</strong>
          </div>

          <div
            className={styles.confidenceTrack}
            role="progressbar"
            aria-label={`AI 제안 신뢰도 ${confidence}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={confidence}
          >
            <span style={{ width: `${confidence}%` }} />
          </div>
        </div>

        <div className={styles.aiMetrics}>
          <div>
            <span>예상 효과</span>
            <strong>{suggestion.impact}</strong>
          </div>
          <div>
            <span>예상 시간</span>
            <strong>{suggestion.estimate}</strong>
          </div>
          <div>
            <span>목표 릴리즈</span>
            <strong>{suggestion.release}</strong>
          </div>
        </div>

        <div className={styles.aiChecklist}>
          <span className={styles.checklistTitle}>권장 구현 순서</span>

          <ol>
            {suggestion.checklist.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </article>
  );
}
