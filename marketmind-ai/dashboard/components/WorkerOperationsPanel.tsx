import type { WorkerOperationsData } from "../types";

type Props = { data: WorkerOperationsData };

function elapsed(value: number | null): string {
  if (value === null) return "실행 중";
  return value >= 60_000
    ? `${(value / 60_000).toFixed(1)}분`
    : `${(value / 1_000).toFixed(1)}초`;
}

export function WorkerOperationsPanel({ data }: Props) {
  if (data.error) {
    return <section className="worker-ops-panel"><h2>워커 자동화</h2><p className="strategy-compare-error">{data.error}</p></section>;
  }
  const latest = data.runs[0];
  if (!latest) {
    return <section className="worker-ops-panel"><h2>워커 자동화</h2><p className="strategy-compare-empty">자동화 SQL 적용 후 워커를 실행하면 상태가 표시됩니다.</p></section>;
  }
  const completed = data.stages.filter((stage) => stage.status === "completed").length;
  const failed = data.stages.filter((stage) => stage.status === "failed").length;
  return (
    <section className="worker-ops-panel">
      <div className="worker-ops-head">
        <div><span>OPERATIONS AUTOMATION</span><h2>5분 자동 워커 모니터</h2><p>Task Scheduler와 DB 잠금으로 중복 실행을 차단하고 단계별 상태를 기록합니다.</p></div>
        <div className={`worker-health worker-${latest.status}`}><small>최근 실행</small><strong>{latest.status === "completed" ? "정상 완료" : latest.status === "failed" ? "실패" : "실행 중"}</strong><em>{new Date(latest.started_at).toLocaleString("ko-KR")}</em></div>
      </div>
      <div className="worker-summary-grid">
        <div><span>실행 방식</span><strong>{latest.trigger_source === "windows_task_scheduler" ? "Windows 자동" : "수동 실행"}</strong></div>
        <div><span>소요 시간</span><strong>{elapsed(latest.duration_ms)}</strong></div>
        <div><span>완료 단계</span><strong>{completed} / {data.stages.length}</strong></div>
        <div><span>실패 단계</span><strong>{failed}</strong></div>
      </div>
      <div className="worker-stage-grid">
        {data.stages.map((stage) => <div key={stage.id} className={`stage-${stage.status}`}><i /><span>{stage.stage_label}</span><b>{stage.status === "completed" ? elapsed(stage.duration_ms) : stage.status === "failed" ? "실패" : "실행 중"}</b></div>)}
      </div>
      {latest.error_message ? <p className="worker-error">{latest.error_message}</p> : null}
    </section>
  );
}
