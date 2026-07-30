import type { FinalMarketDecision } from "../types";
import { SignalCard } from "./SignalCard";

export function SignalComposition({
  decision,
}: {
  decision: FinalMarketDecision;
}) {
  return (
    <section className="signal-grid">
      <SignalCard
        type="technical"
        title="기술적 신호"
        icon="↗"
        score={decision.technical_score}
        confidence={decision.technical_confidence}
        weight={decision.technical_weight}
      />
      <SignalCard
        type="news"
        title="뉴스 신호"
        icon="▤"
        score={decision.news_score}
        confidence={decision.news_confidence}
        weight={decision.news_weight}
      />
      <SignalCard
        type="funding"
        title="펀딩 신호"
        icon="$"
        score={decision.funding_score}
        confidence={decision.funding_confidence}
        weight={decision.funding_weight}
      />
    </section>
  );
}
