import { formatNumber, formatPercent } from "../format";
import type { PerformanceSummary } from "../types";

function MetricRing({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const safe = value === null ? 0 : Math.min(Math.max(value, 0), 100);

  return (
    <div
      className="metric-ring"
      style={{
        background: `conic-gradient(var(--accent) ${safe * 3.6}deg, var(--line) 0deg)`,
      }}
    >
      <div>
        <strong>{value === null ? "—" : `${formatNumber(value, 1)}%`}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function PerformancePanel({
  summary,
}: {
  summary: PerformanceSummary;
}) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">PERFORMANCE ENGINE</span>
          <h2>성과 평가</h2>
        </div>
        <span className="count-badge">{summary.total}건</span>
      </div>

      <div className="ring-grid">
        <MetricRing value={summary.directionAccuracy} label="방향 정확도" />
        <MetricRing value={summary.actionAccuracy} label="행동 정확도" />
      </div>

      <div className="metric-grid">
        <div>
          <span>Direction Hit</span>
          <strong>
            {summary.directionCorrect}/{summary.directionEvaluated}
          </strong>
        </div>
        <div>
          <span>Action Hit</span>
          <strong>
            {summary.actionCorrect}/{summary.actionEvaluated}
          </strong>
        </div>
        <div>
          <span>Avg. Directional Return</span>
          <strong>{formatPercent(summary.averageDirectionalReturn)}</strong>
        </div>
      </div>
    </article>
  );
}
