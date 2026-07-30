import { formatNumber, formatPercent } from "../format";
import type { PerformanceSummary } from "../types";

function AccuracyRing({
  value,
  label,
}: {
  value: number | null;
  label: string;
}) {
  const safe = value === null ? 0 : Math.min(Math.max(value, 0), 100);

  return (
    <div
      className="performance-ring"
      style={{
        background: `conic-gradient(var(--accent) ${safe * 3.6}deg, #26334a 0deg)`,
      }}
    >
      <div>
        <strong>{value === null ? "—" : `${formatNumber(value, 1)}%`}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function PerformanceOverview({
  summary,
}: {
  summary: PerformanceSummary;
}) {
  return (
    <article className="panel performance-panel">
      <div className="chart-heading">
        <div>
          <span className="chart-kicker">PERFORMANCE ENGINE</span>
          <h2>AI 성과 요약</h2>
        </div>
        <span className="timeline-count">
          평가 {summary.evaluated}/{summary.total}
        </span>
      </div>

      <div className="performance-body">
        <div className="performance-rings">
          <AccuracyRing value={summary.directionAccuracy} label="방향 정확도" />
          <AccuracyRing value={summary.actionAccuracy} label="행동 정확도" />
        </div>

        <div className="performance-metrics">
          <div>
            <span>평균 방향 수익률</span>
            <strong>{formatPercent(summary.averageDirectionalReturn, 2)}</strong>
          </div>
          <div>
            <span>누적 방향 수익률</span>
            <strong>{formatPercent(summary.cumulativeDirectionalReturn, 2)}</strong>
          </div>
          <div>
            <span>최고 성과</span>
            <strong className="positive-text">
              {formatPercent(summary.bestDirectionalReturn, 2)}
            </strong>
          </div>
          <div>
            <span>최저 성과</span>
            <strong className="negative-text">
              {formatPercent(summary.worstDirectionalReturn, 2)}
            </strong>
          </div>
        </div>
      </div>
    </article>
  );
}
