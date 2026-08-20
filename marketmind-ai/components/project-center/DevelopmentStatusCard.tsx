import styles from "./ProjectCenter.module.css";

export type ServiceStatus = "healthy" | "warning" | "offline" | "developing";

export type DevelopmentService = {
  name: string;
  description: string;
  status: ServiceStatus;
  detail?: string;
  latencyMs?: number;
  checkedAt?: string;
};

type DevelopmentStatusCardProps = {
  services?: DevelopmentService[];
  checkedAt?: string;
};

const defaultServices: DevelopmentService[] = [
  {
    name: "데이터베이스",
    description: "Vercel과 Supabase 연결 상태",
    status: "developing",
    detail: "상태 확인 대기",
  },
  {
    name: "Market Worker",
    description: "외부 워커의 최근 BTC 캔들 저장 상태",
    status: "developing",
    detail: "상태 확인 대기",
  },
  {
    name: "AI 분석",
    description: "최근 AI Decision 생성 상태",
    status: "developing",
    detail: "상태 확인 대기",
  },
];

const statusMeta: Record<
  ServiceStatus,
  { label: string; className: string }
> = {
  healthy: { label: "정상", className: styles.statusHealthy },
  warning: { label: "주의", className: styles.statusWarning },
  offline: { label: "중단", className: styles.statusOffline },
  developing: { label: "설정 필요", className: styles.statusDeveloping },
};

function formatCheckedAt(value?: string) {
  if (!value) return "확인 시간 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function DevelopmentStatusCard({
  services = defaultServices,
  checkedAt,
}: DevelopmentStatusCardProps) {
  const availableCount = services.filter(
    (service) =>
      service.status === "healthy" || service.status === "developing",
  ).length;

  return (
    <article
      className={`${styles.osCard} ${styles.statusCard}`}
      aria-labelledby="development-status-title"
    >
      <div className={styles.cardGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>LIVE SYSTEM HEALTH</span>
          <h2 id="development-status-title">운영 상태</h2>
        </div>

        <span className={styles.healthSummary}>
          {availableCount}/{services.length} 확인 가능
        </span>
      </div>

      <div className={styles.serviceList}>
        {services.map((service) => {
          const meta = statusMeta[service.status];

          return (
            <div className={styles.serviceItem} key={service.name}>
              <div className={styles.serviceIdentity}>
                <span
                  className={`${styles.statusDot} ${meta.className}`}
                  aria-hidden="true"
                />

                <div>
                  <strong>{service.name}</strong>
                  <p>{service.description}</p>
                </div>
              </div>

              <div className={styles.serviceState}>
                {service.detail ? <span>{service.detail}</span> : null}
                <strong className={meta.className}>{meta.label}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.statusFooter}>
        <span className={styles.liveIndicator} aria-hidden="true" />
        마지막 확인: {formatCheckedAt(checkedAt)}
      </div>
    </article>
  );
}
