import { formatPercent, normalizeLabel } from "../format";
import type { FinalMarketBacktest } from "../types";

const HORIZONS = [
  ["5m", "return_5m"],
  ["15m", "return_15m"],
  ["30m", "return_30m"],
  ["1h", "return_1h"],
  ["4h", "return_4h"],
  ["24h", "return_24h"],
] as const;

function heatClass(value: number | null): string {
  if (value === null) return "heat-pending";
  if (value >= 1) return "heat-strong-positive";
  if (value > 0) return "heat-positive";
  if (value <= -1) return "heat-strong-negative";
  if (value < 0) return "heat-negative";
  return "heat-neutral";
}

export function BacktestHeatmap({
  backtests,
  latestDecisionId,
}: {
  backtests: FinalMarketBacktest[];
  latestDecisionId: number;
}) {
  const latest =
    backtests.find((row) => row.decision_id === latestDecisionId) ??
    backtests[0] ??
    null;

  return (
    <article className="panel backtest-panel">
      <div className="chart-heading">
        <div>
          <span className="chart-kicker">BACKTEST HEATMAP</span>
          <h2>구간별 백테스트</h2>
        </div>
        <span className="timeline-count">
          {latest ? normalizeLabel(latest.status) : "데이터 없음"}
        </span>
      </div>

      {!latest ? (
        <div className="chart-empty">백테스트 데이터가 없습니다.</div>
      ) : (
        <>
          <div className="heatmap-grid">
            {HORIZONS.map(([label, field]) => {
              const value = latest[field];

              return (
                <div className={`heat-cell ${heatClass(value)}`} key={field}>
                  <span>{label}</span>
                  <strong>{formatPercent(value, 2)}</strong>
                </div>
              );
            })}
          </div>

          <div className="backtest-summary-grid">
            <div>
              <span>최고 수익률</span>
              <strong className="positive-text">
                {formatPercent(latest.best_return, 2)}
              </strong>
            </div>
            <div>
              <span>최저 수익률</span>
              <strong className="negative-text">
                {formatPercent(latest.worst_return, 2)}
              </strong>
            </div>
            <div>
              <span>평가 ID</span>
              <strong>#{latest.decision_id}</strong>
            </div>
          </div>
        </>
      )}
    </article>
  );
}
