import styles from "@/components/project-center/ProjectCenter.module.css";

export default function ProjectCenterLoading() {
  return (
    <main className="page-shell">
      <div className="terminal">
        <div className={styles.loading}>
          <div className={styles.loadingCard}>
            <div className={styles.pulse} />
            <strong>Project Center를 준비하고 있습니다.</strong>
          </div>
        </div>
      </div>
    </main>
  );
}
