import styles from "./ProjectCenter.module.css";

export type BuildState =
  | "success"
  | "building"
  | "failed"
  | "ready"
  | "unknown";

export type BuildEnvironment = {
  name: string;
  state: BuildState;
  detail: string;
  updatedAt?: string;
  url?: string;
};

export type BuildSummary = {
  latestState: BuildState;
  latestLabel: string;
  latestUpdatedAt?: string;
  branch: string;
  commitSha?: string;
  environments: BuildEnvironment[];
};

type BuildCenterCardProps = {
  build?: BuildSummary;
  error?: string;
};

const stateLabel: Record<BuildState, string> = {
  success: "성공",
  building: "빌드 중",
  failed: "실패",
  ready: "정상",
  unknown: "확인 필요",
};

const stateClass: Record<BuildState, string> = {
  success: styles.buildSuccess,
  building: styles.buildBuilding,
  failed: styles.buildFailed,
  ready: styles.buildSuccess,
  unknown: styles.buildUnknown,
};

function formatDate(value?: string) {
  if (!value) return "시간 정보 없음";

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function BuildCenterCard({ build, error }: BuildCenterCardProps) {
  const latestState = build?.latestState ?? "unknown";

  return (
    <article
      className={`${styles.osCard} ${styles.buildCenterCard}`}
      aria-labelledby="build-center-title"
    >
      <div className={styles.buildGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>BUILD & DEPLOYMENT</span>
          <h2 id="build-center-title">빌드 센터</h2>
        </div>

        <span
          className={`${styles.buildStateBadge} ${stateClass[latestState]}`}
        >
          <i aria-hidden="true" />
          {stateLabel[latestState]}
        </span>
      </div>

      {error || !build ? (
        <div className={styles.buildEmptyState}>
          <strong>배포 정보를 확인할 수 없습니다.</strong>
          <p>{error ?? "Vercel 환경변수를 설정해 주세요."}</p>
        </div>
      ) : (
        <div className={styles.buildBody}>
          <div className={styles.buildHero}>
            <div>
              <span>LATEST BUILD</span>
              <strong>{build.latestLabel}</strong>
              <small>{formatDate(build.latestUpdatedAt)}</small>
            </div>

            <div className={styles.buildIdentity}>
              <span>BRANCH</span>
              <strong>{build.branch}</strong>
              <code>{build.commitSha?.slice(0, 7) ?? "-------"}</code>
            </div>
          </div>

          <div className={styles.environmentList}>
            {build.environments.map((environment) => (
              <div className={styles.environmentItem} key={environment.name}>
                <div className={styles.environmentIdentity}>
                  <span
                    className={`${styles.environmentDot} ${
                      stateClass[environment.state]
                    }`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{environment.name}</strong>
                    <p>{environment.detail}</p>
                  </div>
                </div>

                <div className={styles.environmentState}>
                  <span>{formatDate(environment.updatedAt)}</span>
                  {environment.url ? (
                    <a
                      href={environment.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      열기
                    </a>
                  ) : (
                    <strong className={stateClass[environment.state]}>
                      {stateLabel[environment.state]}
                    </strong>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
