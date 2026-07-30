import { formatPercent } from "../format";
import type { DirectionVotes } from "../types";

export function ConsensusPanel({ votes }: { votes: DirectionVotes | null }) {
  const normalized = votes ?? { bullish: 0, neutral: 0, bearish: 0 };
  const rows = [
    ["상승", normalized.bullish, "bullish"],
    ["중립", normalized.neutral, "neutral"],
    ["하락", normalized.bearish, "bearish"],
  ] as const;

  return (
    <section className="panel consensus-panel">
      <div className="panel-heading"><span>DIRECTION CONSENSUS</span><h2>방향 투표</h2></div>
      <div className="vote-list">
        {rows.map(([label, value, tone]) => (
          <div className="vote-row" key={tone}>
            <div><span>{label}</span><strong>{formatPercent(value, 0)}</strong></div>
            <div className={`vote-track ${tone}`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
