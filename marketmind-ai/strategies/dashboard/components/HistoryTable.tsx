import { directionLabel, formatDateTime, formatPercent, signalLabel, toneClass } from "../format";
import type { MarketIntelligenceRow } from "../types";

export function HistoryTable({ rows }: { rows: MarketIntelligenceRow[] }) {
  return (
    <section className="panel history-panel">
      <div className="section-heading compact-heading">
        <div><span>RECENT RUNS</span><h2>최근 분석 기록</h2></div>
        <p>최신 {rows.length}건</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>분석 시각</th><th>점수</th><th>시그널</th><th>방향</th><th>신뢰도</th><th>합의도</th><th>버전</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.id)}>
                <td>{formatDateTime(row.calculated_at)}</td>
                <td className="numeric strong-cell">{Number(row.market_score).toFixed(1)}</td>
                <td><span className={toneClass(row.signal)}>{signalLabel(row.signal)}</span></td>
                <td><span className={toneClass(row.direction)}>{directionLabel(row.direction)}</span></td>
                <td className="numeric">{formatPercent(row.confidence, 1)}</td>
                <td className="numeric">{formatPercent(row.consensus_strength, 0)}</td>
                <td>{row.strategy_version ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
