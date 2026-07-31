import type {
  OptimizationReadinessCheck,
  OptimizationStatusData,
} from "../types";

type Props = { data: OptimizationStatusData };

function overallLabel(value: string): string {
  return {
    collecting: "데이터 수집 중",
    ready_for_review: "수동 검토 준비",
    attention: "확인 필요",
  }[value] ?? value;
}

function checkLabel(value: OptimizationReadinessCheck["status"]): string {
  return {
    complete: "완료",
    collecting: "수집 중",
    attention: "확인",
    locked: "잠금",
  }[value];
}

export function OptimizationStatusPanel({ data }: Props) {
  if (data.error) {
    return (
      <section className="optimization-status-panel">
        <h2>Phase 5 최적화 상태</h2>
        <p className="strategy-compare-error">{data.error}</p>
      </section>
    );
  }

  const status = data.status;
  if (!status) {
    return (
      <section className="optimization-status-panel">
        <h2>Phase 5 최적화 상태</h2>
        <p className="strategy-compare-empty">
          워커가 Phase 5-5 통합 점검을 완료하면 상태가 표시됩니다.
        </p>
      </section>
    );
  }

  const checks = Array.isArray(status.checks) ? status.checks : [];

  return (
    <section className={`optimization-status-panel status-${status.overall_status}`}>
      <div className="optimization-status-head">
        <div>
          <span>PHASE 5 COMPLETION CENTER</span>
          <h2>전략 최적화 통합 상태</h2>
          <p>{status.summary}</p>
        </div>
        <div className="optimization-progress">
          <small>{overallLabel(status.overall_status)}</small>
          <strong>{status.progress_percent}%</strong>
          <div><i style={{ width: `${status.progress_percent}%` }} /></div>
        </div>
      </div>

      <div className="optimization-check-grid">
        {checks.map((check) => (
          <article key={check.key}>
            <header>
              <span>{check.label}</span>
              <b className={`check-${check.status}`}>{checkLabel(check.status)}</b>
            </header>
            <p>{check.detail}</p>
          </article>
        ))}
      </div>

      <div className="optimization-safety-lock">
        <div>
          <span>AUTOMATIC APPLICATION</span>
          <strong>영구 차단</strong>
        </div>
        <p>
          Phase 5 분석이 완료되어도 실제 전략 변경은 자동 실행되지 않습니다.
          검증된 추천은 반드시 수동 검토 후 별도 단계에서만 반영합니다.
        </p>
      </div>
    </section>
  );
}
