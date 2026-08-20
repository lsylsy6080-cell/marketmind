import { normalizeLabel, getTone } from "../format";
import type { FinalMarketDecision } from "../types";

export function CurrentDecision({ decision }: { decision: FinalMarketDecision }) {
  const confidence = Math.min(100, Math.max(0, Number(decision.final_confidence ?? 0)));
  return (
    <article className="panel decision-panel mm-final-decision">
      <div className="panel-title-row">
        <h2>AI 최종 결정</h2>
        <span className="live-badge">실시간</span>
      </div>

      <div className="mm-final-head">
        <strong className={`tone-${getTone(decision.direction)}`}>{normalizeLabel(decision.direction)}</strong>
        <span>신뢰도 {confidence.toFixed(0)}%</span>
      </div>

      <div className="mm-final-progress"><i style={{width:`${confidence}%`}} /></div>

      <dl className="mm-final-list">
        <div><dt>행동</dt><dd>{normalizeLabel(decision.action)}</dd></div>
        <div><dt>거래 권한</dt><dd>{normalizeLabel(decision.trading_permission)}</dd></div>
        <div><dt>위험 수준</dt><dd>{normalizeLabel(decision.risk_level)}</dd></div>
        <div><dt>최종 점수</dt><dd>{Number(decision.final_score).toFixed(2)}</dd></div>
      </dl>

      <div className="mm-decision-summary">
        <span>AI 판단 요약</span>
        <p>{decision.decision_summary ?? "현재 기술·뉴스·펀딩 신호를 종합해 시장 방향을 판단하고 있습니다."}</p>
      </div>
    </article>
  );
}
