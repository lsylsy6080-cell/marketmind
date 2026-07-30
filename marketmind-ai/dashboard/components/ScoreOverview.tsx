import { formatNumber, formatWeight } from "../format";
import type { FinalMarketDecision } from "../types";

function ScoreCard({
  label,
  score,
  confidence,
  weight,
}: {
  label: string;
  score: number | null;
  confidence: number | null;
  weight: number | null;
}) {
  const safe = score === null ? 0 : Math.min(Math.max(score, 0), 100);

  return (
    <div className="score-card">
      <div className="score-card-top">
        <div>
          <span>{label}</span>
          <strong>{formatNumber(score, 1)}</strong>
        </div>
        <small>Weight {formatWeight(weight)}</small>
      </div>

      <div className="score-track">
        <span style={{ width: `${safe}%` }} />
      </div>

      <div className="score-card-bottom">
        <span>Confidence</span>
        <strong>{formatNumber(confidence, 1)}%</strong>
      </div>
    </div>
  );
}

export function ScoreOverview({
  decision,
}: {
  decision: FinalMarketDecision;
}) {
  return (
    <article className="panel score-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">SIGNAL COMPOSITION</span>
          <h2>신호 구성</h2>
        </div>
      </div>

      <div className="score-list">
        <ScoreCard
          label="Technical"
          score={decision.technical_score}
          confidence={decision.technical_confidence}
          weight={decision.technical_weight}
        />
        <ScoreCard
          label="News"
          score={decision.news_score}
          confidence={decision.news_confidence}
          weight={decision.news_weight}
        />
        <ScoreCard
          label="Funding"
          score={decision.funding_score}
          confidence={decision.funding_confidence}
          weight={decision.funding_weight}
        />
      </div>

      <div className="composition-note">
        현재 전략은 Technical·News·Funding 신호를 결합하여 최종 판단을
        생성합니다.
      </div>
    </article>
  );
}
