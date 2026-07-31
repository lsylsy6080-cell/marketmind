import {
  getMarketPressure,
  getRegimeDescription,
  getStrategy,
  normalizeLabel,
} from "../format";
import type { FinalMarketDecision } from "../types";

function InsightCard({
  icon,
  label,
  title,
  description,
  tag,
}: {
  icon: string;
  label: string;
  title: string;
  description: string;
  tag: string;
}) {
  return (
    <div className="insight-card">
      <span className="insight-icon">{icon}</span>
      <div>
        <span className="insight-label">{label}</span>
        <strong>{title}</strong>
        <p>{description}</p>
        <small>{tag}</small>
      </div>
    </div>
  );
}

export function AiInsightPanel({
  decision,
}: {
  decision: FinalMarketDecision;
}) {
  const pressure = getMarketPressure(decision.market_regime);
  const strategy = getStrategy(
    decision.direction,
    decision.trading_permission,
  );

  return (
    <section className="panel ai-insight-panel">
      <div className="summary-column">
        <span className="summary-heading">◈ AI 판단 요약</span>
        <p>
          {decision.decision_summary ??
            "현재 기술·뉴스·펀딩 신호를 종합하여 시장을 분석하고 있습니다."}
        </p>
      </div>

      <InsightCard
        icon="〽"
        label="시장 국면"
        title={normalizeLabel(decision.market_regime)}
        description={getRegimeDescription(decision.market_regime)}
        tag={normalizeLabel(decision.market_regime)}
      />

      <InsightCard
        icon="◔"
        label="시장 압력"
        title={pressure.title}
        description={pressure.description}
        tag={pressure.tag}
      />

      <InsightCard
        icon="◇"
        label="추천 전략"
        title={strategy.title}
        description={strategy.description}
        tag={strategy.tag}
      />
    </section>
  );
}
