import { formatPercent } from "../format";
import type { BacktestSummary } from "../types";

export function BacktestPanel({
  summary,
}: {
  summary: BacktestSummary;
}) {
  const completionRate =
    summary.total > 0 ? (summary.completed / summary.total) * 100 : 0;

  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">BACKTEST ENGINE</span>
          <h2>백테스트 현황</h2>
        </div>
        <span className="count-badge">{summary.total}건</span>
      </div>

      <div className="completion-header">
        <div>
          <span>24시간 평가 완료율</span>
          <strong>{completionRate.toFixed(1)}%</strong>
        </div>
        <div className="progress-track">
          <span style={{ width: `${completionRate}%` }} />
        </div>
      </div>

      <div className="status-grid">
        <div>
          <span className="stat-dot completed" />
          <small>완료</small>
          <strong>{summary.completed}</strong>
        </div>
        <div>
          <span className="stat-dot progress" />
          <small>진행 중</small>
          <strong>{summary.inProgress}</strong>
        </div>
        <div>
          <span className="stat-dot failed" />
          <small>오류</small>
          <strong>{summary.failed}</strong>
        </div>
      </div>

      <div className="metric-grid">
        <div>
          <span>Avg. 24H Return</span>
          <strong>{formatPercent(summary.average24hReturn)}</strong>
        </div>
        <div>
          <span>Best Return</span>
          <strong className="metric-positive">
            {formatPercent(summary.bestReturn)}
          </strong>
        </div>
        <div>
          <span>Worst Return</span>
          <strong className="metric-negative">
            {formatPercent(summary.worstReturn)}
          </strong>
        </div>
      </div>
    </article>
  );
}
