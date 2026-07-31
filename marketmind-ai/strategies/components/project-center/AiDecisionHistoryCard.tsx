import type { AiDecisionSnapshot } from "./AiDecisionMonitorCard";
import styles from "./ProjectCenter.module.css";

type AiDecisionHistoryCardProps = {
  history: AiDecisionSnapshot[];
  error?: string;
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function AiDecisionHistoryCard({
  history,
  error,
}: AiDecisionHistoryCardProps) {
  return (
    <article className={`${styles.osCard} ${styles.aiDecisionHistoryCard}`}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>DECISION HISTORY</span>
          <h2>최근 판단 이력</h2>
        </div>
        <span className={styles.timelineCount}>{history.length} RECORDS</span>
      </div>

      {history.length === 0 ? (
        <div className={styles.decisionHistoryEmpty}>
          <strong>기록된 판단 이력이 없습니다.</strong>
          <p>{error ?? "AI Decision Engine 실행 이후 이곳에 판단 변화가 표시됩니다."}</p>
        </div>
      ) : (
        <div className={styles.decisionHistoryList}>
          {history.map((item, index) => (
            <article className={styles.decisionHistoryItem} key={item.id}>
              <div className={styles.decisionHistoryRail}>
                <span
                  className={`${styles.decisionHistoryNode} ${styles[`decisionHistoryNode${item.signal}`]}`}
                />
                {index < history.length - 1 ? <i /> : null}
              </div>
              <div className={styles.decisionHistoryContent}>
                <div className={styles.decisionHistoryTop}>
                  <div>
                    <strong>{item.symbol}</strong>
                    <span>{item.timeframe}</span>
                  </div>
                  <time>{formatTime(item.generatedAt)}</time>
                </div>
                <div className={styles.decisionHistoryMeta}>
                  <span
                    className={`${styles.historySignal} ${styles[`historySignal${item.signal}`]}`}
                  >
                    {item.signal}
                  </span>
                  <span>신뢰도 {Math.round(item.confidence)}%</span>
                  <span>시장 {Math.round(item.marketScore)}</span>
                  <span>위험 {item.risk}</span>
                </div>
                <p>{item.summary}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </article>
  );
}
