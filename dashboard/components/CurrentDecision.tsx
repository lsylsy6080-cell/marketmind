import { normalizeLabel, getTone } from "../format";
import type { FinalMarketDecision } from "../types";
import { ArcGauge } from "./ArcGauge";

function DecisionValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="decision-value">
      <span>{label}</span>
      <strong className={`tone-${tone}`}>{value}</strong>
    </div>
  );
}

export function CurrentDecision({
  decision,
}: {
  decision: FinalMarketDecision;
}) {
  return (
    <article className="panel decision-panel">
      <div className="decision-side">
        <div className="panel-title-row">
          <h2>현재 시장 판단</h2>
          <span className="live-badge">실시간 AI 판단</span>
        </div>

        <DecisionValue
          label="방향"
          value={normalizeLabel(decision.direction)}
          tone={getTone(decision.direction)}
        />
        <DecisionValue
          label="행동"
          value={normalizeLabel(decision.action)}
          tone={getTone(decision.action)}
        />
        <DecisionValue
          label="거래 권한"
          value={normalizeLabel(decision.trading_permission)}
          tone={getTone(decision.trading_permission)}
        />
        <DecisionValue
          label="위험 수준"
          value={normalizeLabel(decision.risk_level)}
          tone={getTone(decision.risk_level)}
        />
      </div>

      <ArcGauge
        value={decision.final_score}
        label="Final Score"
        direction={normalizeLabel(decision.direction)}
        confidence={decision.final_confidence}
      />
    </article>
  );
}
