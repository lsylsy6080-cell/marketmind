import { formatNumber, formatWeight } from "../format";

export function SignalCard({
  type,
  title,
  icon,
  score,
  confidence,
  weight,
}: {
  type: "technical" | "news" | "funding";
  title: string;
  icon: string;
  score: number | null;
  confidence: number | null;
  weight: number | null;
}) {
  const safe = score === null ? 0 : Math.min(Math.max(score, 0), 100);

  return (
    <article className={`signal-card signal-${type}`}>
      <div className="signal-card-title">
        <span className="signal-icon">{icon}</span>
        <strong>{title}</strong>
      </div>

      <div className="signal-score">
        <strong>{formatNumber(score, 1)}</strong>
        <span>/ 100</span>
      </div>

      <div className="signal-weight">가중치 {formatWeight(weight)}</div>

      <div className="signal-progress">
        <span style={{ width: `${safe}%` }} />
      </div>

      <div className="signal-confidence">
        신뢰도 <strong>{formatNumber(confidence, 1)}%</strong>
      </div>
    </article>
  );
}
