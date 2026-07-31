import type { StrategyComparisonData, StrategyComparisonRow } from "../types";

type Props = { data: StrategyComparisonData };

const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });
function pct(value: number) { return `${nf.format(value)}%`; }
function money(value: number) { return `${nf.format(value)} USDT`; }
function tone(value: number) { return value > 0 ? "is-positive" : value < 0 ? "is-negative" : ""; }
function kindLabel(value: string | null) {
  return ({ conservative: "보수형", balanced: "균형형", aggressive: "공격형", momentum: "모멘텀형" } as Record<string,string>)[value ?? ""] ?? "사용자 전략";
}
function leader(rows: StrategyComparisonRow[]) {
  return rows.reduce<StrategyComparisonRow | null>((best,row) => !best || row.total_return_percent > best.total_return_percent ? row : best, null);
}

export function StrategyComparePanel({ data }: Props) {
  if (data.error) return <section className="strategy-compare-panel"><h2>전략 비교</h2><p className="strategy-compare-error">{data.error}</p></section>;
  if (data.rows.length === 0) return <section className="strategy-compare-panel"><h2>전략 비교</h2><p className="strategy-compare-empty">012 SQL 적용 후 전략별 결과가 표시됩니다.</p></section>;
  const best = leader(data.rows);
  return (
    <section className="strategy-compare-panel">
      <div className="strategy-compare-head">
        <div><span className="strategy-compare-kicker">MULTI STRATEGY LAB</span><h2>다중 전략 성과 비교</h2><p>같은 시장 판단을 독립 계정으로 실행해 전략별 결과를 공정하게 비교합니다.</p></div>
        <div className="strategy-leader"><span>현재 선두</span><strong>{best?.strategy_name ?? "표본 수집 중"}</strong><em>{best ? pct(best.total_return_percent) : "-"}</em></div>
      </div>
      <div className="strategy-card-grid">
        {data.rows.map((row) => (
          <article className={`strategy-card ${best?.config_id === row.config_id ? "is-leader" : ""}`} key={row.config_id}>
            <header><div><span className="strategy-kind">{kindLabel(row.strategy_kind)}</span><h3>{row.strategy_name}</h3></div><span className="strategy-symbol">{row.symbol}</span></header>
            <p className="strategy-description">{row.description}</p>
            <div className="strategy-primary"><div><span>누적 수익률</span><strong className={tone(row.total_return_percent)}>{pct(row.total_return_percent)}</strong></div><div><span>총 자산</span><strong>{money(row.equity)}</strong></div></div>
            <div className="strategy-metrics">
              <div><span>승률</span><b>{pct(row.win_rate)}</b><small>{row.winning_trades}승 / {row.losing_trades}패</small></div>
              <div><span>거래 수</span><b>{row.total_trades}</b><small>보유 {row.open_positions}</small></div>
              <div><span>평균 수익률</span><b className={tone(row.avg_return_percent)}>{pct(row.avg_return_percent)}</b><small>거래당</small></div>
              <div><span>Profit Factor</span><b>{row.profit_factor == null ? "-" : nf.format(row.profit_factor)}</b><small>손익비</small></div>
            </div>
            <div className="strategy-rules"><span>LONG ≥ {nf.format(row.long_score_min)}</span><span>SHORT ≤ {nf.format(row.short_score_max)}</span><span>신뢰도 ≥ {nf.format(row.confidence_min)}</span><span>SL {pct(row.stop_loss_percent)} / TP {pct(row.take_profit_percent)}</span></div>
          </article>
        ))}
      </div>
      <div className="strategy-table-wrap"><table className="strategy-table"><thead><tr><th>전략</th><th>총 자산</th><th>순손익</th><th>수익률</th><th>승률</th><th>평균 수익</th><th>평균 손실</th><th>평균 보유</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.config_id}><td><strong>{row.strategy_name}</strong><small>{row.strategy_version}</small></td><td>{money(row.equity)}</td><td className={tone(row.net_pnl)}>{money(row.net_pnl)}</td><td className={tone(row.total_return_percent)}>{pct(row.total_return_percent)}</td><td>{pct(row.win_rate)}</td><td className="is-positive">{pct(row.avg_win_percent)}</td><td className="is-negative">{pct(row.avg_loss_percent)}</td><td>{nf.format(row.avg_holding_minutes)}분</td></tr>)}</tbody></table></div>
      <p className="strategy-sample-note">거래 표본이 적을 때 순위는 쉽게 바뀔 수 있습니다. 최소 30~50회 청산 이후부터 참고하고, 100회 이상부터 본격 비교하는 것을 권장합니다.</p>
    </section>
  );
}
