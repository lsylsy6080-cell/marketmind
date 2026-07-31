import {
  formatNumber,
  formatTime,
  getMarketPressure,
  getTone,
  normalizeLabel,
} from "../format";
import type { FinalMarketDecision } from "../types";

export function DecisionTimeline({
  decisions,
}: {
  decisions: FinalMarketDecision[];
}) {
  return (
    <article className="panel timeline-panel">
      <div className="chart-heading">
        <div>
          <span className="chart-kicker">DECISION TIMELINE</span>
          <h2>판단 변화 타임라인</h2>
        </div>
        <span className="timeline-count">{decisions.length}개 신호</span>
      </div>

      <div className="timeline-scroll-shell">
        <div className="timeline-list">
          {decisions.length === 0 ? (
            <div className="chart-empty">판단 이력이 없습니다.</div>
          ) : (
            decisions.map((decision, index) => {
              const pressure = getMarketPressure(decision.market_regime);

              return (
                <div className="timeline-row" key={decision.id}>
                  <div className="timeline-rail">
                    <span
                      className={`timeline-dot tone-bg-${getTone(
                        decision.direction,
                      )}`}
                    />
                    {index < decisions.length - 1 ? (
                      <span className="timeline-line" />
                    ) : null}
                  </div>

                  <div className="timeline-time">
                    <strong>{formatTime(decision.decided_at)}</strong>
                    <small>
                      {new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "2-digit",
                        day: "2-digit",
                      }).format(new Date(decision.decided_at))}
                    </small>
                  </div>

                  <div className={`timeline-action tone-${getTone(decision.action)}`}>
                    <span className="timeline-action-icon">
                      {decision.direction === "bearish" ? "↓" : decision.direction === "bullish" ? "↑" : "⌛"}
                    </span>
                    <strong>{normalizeLabel(decision.action)}</strong>
                  </div>

                  <div className="timeline-score">
                    <strong>{formatNumber(decision.final_score, 1)}</strong>
                    <small>Final Score</small>
                  </div>

                  <div className="timeline-confidence">
                    <strong>{formatNumber(decision.final_confidence, 1)}%</strong>
                    <small>신뢰도</small>
                  </div>

                  <span className={`table-badge badge-${getTone(decision.trading_permission)}`}>
                    {normalizeLabel(decision.trading_permission)}
                  </span>

                  <div className="timeline-regime">
                    <small>시장 국면</small>
                    <strong>{normalizeLabel(decision.market_regime)}</strong>
                    <span>{pressure.title}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </article>
  );
}
