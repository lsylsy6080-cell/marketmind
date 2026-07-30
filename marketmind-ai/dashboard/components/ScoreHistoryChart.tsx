import { formatNumber, formatTime } from "../format";
import type { FinalMarketDecision } from "../types";

const WIDTH = 760;
const HEIGHT = 260;
const PADDING_X = 42;
const PADDING_Y = 28;

function buildPoints(
  decisions: FinalMarketDecision[],
  field: "final_score" | "final_confidence",
): string {
  if (decisions.length === 0) return "";

  return decisions
    .map((decision, index) => {
      const x =
        PADDING_X +
        (index / Math.max(decisions.length - 1, 1)) * (WIDTH - PADDING_X * 2);
      const value = decision[field] ?? 50;
      const y =
        HEIGHT -
        PADDING_Y -
        (Math.min(Math.max(value, 0), 100) / 100) *
          (HEIGHT - PADDING_Y * 2);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ScoreHistoryChart({
  decisions,
}: {
  decisions: FinalMarketDecision[];
}) {
  const scorePoints = buildPoints(decisions, "final_score");
  const confidencePoints = buildPoints(decisions, "final_confidence");
  const latest = decisions.at(-1) ?? null;

  return (
    <article className="panel chart-panel">
      <div className="chart-heading">
        <div>
          <span className="chart-kicker">SCORE HISTORY</span>
          <h2>AI 점수 변화</h2>
        </div>
        <div className="chart-legend">
          <span><i className="legend-score" /> Final Score</span>
          <span><i className="legend-confidence" /> Confidence</span>
        </div>
      </div>

      {decisions.length < 2 ? (
        <div className="chart-empty">차트를 표시할 판단 데이터가 부족합니다.</div>
      ) : (
        <>
          <div className="chart-canvas">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img">
              <defs>
                <linearGradient id="scoreArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0, 25, 50, 75, 100].map((value) => {
                const y =
                  HEIGHT -
                  PADDING_Y -
                  (value / 100) * (HEIGHT - PADDING_Y * 2);

                return (
                  <g key={value}>
                    <line
                      className="chart-grid-line"
                      x1={PADDING_X}
                      x2={WIDTH - PADDING_X}
                      y1={y}
                      y2={y}
                    />
                    <text className="chart-axis-label" x="8" y={y + 4}>
                      {value}
                    </text>
                  </g>
                );
              })}

              <polygon
                className="score-area"
                points={`${PADDING_X},${HEIGHT - PADDING_Y} ${scorePoints} ${WIDTH - PADDING_X},${HEIGHT - PADDING_Y}`}
              />
              <polyline className="score-line" points={scorePoints} />
              <polyline
                className="confidence-line"
                points={confidencePoints}
              />
            </svg>
          </div>

          <div className="chart-footer">
            <span>{formatTime(decisions[0]?.decided_at ?? null)}</span>
            <div>
              <strong>{formatNumber(latest?.final_score ?? null, 1)}</strong>
              <small>현재 Final Score</small>
            </div>
            <span>{formatTime(latest?.decided_at ?? null)}</span>
          </div>
        </>
      )}
    </article>
  );
}
