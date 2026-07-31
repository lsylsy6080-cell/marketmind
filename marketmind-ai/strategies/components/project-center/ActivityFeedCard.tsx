import styles from "./ProjectCenter.module.css";

export type ActivityTone = "success" | "info" | "waiting" | "warning";

export type ActivityItem = {
  time: string;
  source: string;
  message: string;
  status: string;
  tone: ActivityTone;
};

type ActivityFeedCardProps = {
  activities?: ActivityItem[];
  checkedAt?: string;
};

const defaultActivities: ActivityItem[] = [
  {
    time: "--:--",
    source: "Project Center",
    message: "실시간 운영 데이터 연결을 기다리고 있습니다.",
    status: "대기",
    tone: "waiting",
  },
];

const toneClass: Record<ActivityTone, string> = {
  success: styles.activitySuccess,
  info: styles.activityInfo,
  waiting: styles.activityWaiting,
  warning: styles.activityWarning,
};

export function ActivityFeedCard({
  activities = defaultActivities,
  checkedAt,
}: ActivityFeedCardProps) {
  return (
    <article
      className={`${styles.osCard} ${styles.activityCard}`}
      aria-labelledby="activity-feed-title"
    >
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>SYSTEM ACTIVITY</span>
          <h2 id="activity-feed-title">실시간 활동 피드</h2>
        </div>

        <span className={styles.liveBadge}>
          <i aria-hidden="true" />
          LIVE
        </span>
      </div>

      <div className={styles.activityFeed}>
        {activities.map((activity, index) => (
          <div
            className={styles.activityItem}
            key={`${activity.time}-${activity.source}-${index}`}
          >
            <time>{activity.time}</time>

            <span
              className={`${styles.activityDot} ${toneClass[activity.tone]}`}
              aria-hidden="true"
            />

            <div className={styles.activityContent}>
              <div>
                <strong>{activity.source}</strong>
                <span className={toneClass[activity.tone]}>
                  {activity.status}
                </span>
              </div>

              <p>{activity.message}</p>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.activityFooter}>
        {checkedAt
          ? `운영 상태 확인 완료 · ${new Date(checkedAt).toLocaleString("ko-KR")}`
          : "운영 상태 확인 대기"}
      </div>
    </article>
  );
}
