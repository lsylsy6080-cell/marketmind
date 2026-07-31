import styles from "./ProjectCenter.module.css";

export type GitCommitItem = {
  sha: string;
  message: string;
  author: string;
  committedAt: string;
  url?: string;
};

type GitTimelineCardProps = {
  repository?: string;
  branch?: string;
  commits?: GitCommitItem[];
  error?: string;
};

function formatCommitDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function GitTimelineCard({
  repository = "저장소 미설정",
  branch = "main",
  commits = [],
  error,
}: GitTimelineCardProps) {
  return (
    <article
      className={`${styles.osCard} ${styles.gitTimelineCard}`}
      aria-labelledby="git-timeline-title"
    >
      <div className={styles.gitGlow} aria-hidden="true" />

      <div className={styles.cardHeader}>
        <div>
          <span className={styles.cardEyebrow}>SOURCE CONTROL</span>
          <h2 id="git-timeline-title">Git 타임라인</h2>
        </div>

        <span className={styles.branchBadge}>
          <i aria-hidden="true" />
          {branch}
        </span>
      </div>

      <div className={styles.gitRepositoryMeta}>
        <span>REPOSITORY</span>
        <strong>{repository}</strong>
      </div>

      {error ? (
        <div className={styles.gitEmptyState}>
          <strong>Git 정보를 불러오지 못했습니다.</strong>
          <p>{error}</p>
        </div>
      ) : commits.length === 0 ? (
        <div className={styles.gitEmptyState}>
          <strong>표시할 커밋이 없습니다.</strong>
          <p>GitHub 저장소 환경변수를 설정하면 최근 커밋이 표시됩니다.</p>
        </div>
      ) : (
        <div className={styles.gitCommitList}>
          {commits.map((commit, index) => (
            <div className={styles.gitCommitItem} key={commit.sha}>
              <div className={styles.gitRail} aria-hidden="true">
                <span className={styles.gitNode} />
                {index < commits.length - 1 ? (
                  <i className={styles.gitLine} />
                ) : null}
              </div>

              <div className={styles.gitCommitContent}>
                <div className={styles.gitCommitTop}>
                  <code>{commit.sha.slice(0, 7)}</code>
                  <time>{formatCommitDate(commit.committedAt)}</time>
                </div>

                <strong>{commit.message}</strong>

                <div className={styles.gitCommitFooter}>
                  <span>{commit.author}</span>
                  {commit.url ? (
                    <a href={commit.url} target="_blank" rel="noreferrer">
                      GitHub에서 보기
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
