import { formatNumber, formatPercent, formatRelativeTime } from "../format";
import type { StrategyPerformanceSnapshot } from "../types";

type Props = {
  data: StrategyPerformanceSnapshot | null;
  error?: string | null;
};

function signed(value: number, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${number.toFixed(digits)}`;
}

function secondsLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const seconds = Math.max(0, Math.round(Number(value)));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function closeReasonLabel(value: string | undefined) {
  const labels: Record<string, string> = {
    take_profit: "익절",
    stop_loss: "손절",
    max_holding: "최대 보유시간",
    opposite_signal: "반대 신호",
    signal_exit: "신호 청산",
    timeout: "시간 종료",
    manual: "수동 청산",
  };
  return value ? labels[value] ?? value : "기타";
}

function sampleLabel(value: string) {
  if (value === "ready") return "검증 준비";
  if (value === "provisional") return "검증 중";
  return "표본 수집 중";
}

export function StrategyPerformanceV2Panel({ data, error = null }: Props) {
  return (
    <section className="panel paper-analytics-v2">
      <div className="paper-analytics-head">
        <div>
          <span className="section-kicker">PERFORMANCE ANALYTICS V2</span>
          <h2>전략 성과 분석 <small>Phase 6-1 V2</small></h2>
          <p>
            {data
              ? `${data.strategy_version ?? `전략 #${data.strategy_config_id}`} · 최신 성과 스냅샷 ${formatRelativeTime(data.analyzed_at)}`
              : "성과 V2 스냅샷을 기다리고 있습니다."}
          </p>
        </div>
        {data ? (
          <span className={`paper-sample-status ${data.sample_status}`}>{sampleLabel(data.sample_status)}</span>
        ) : (
          <span className="paper-sample-status">데이터 대기</span>
        )}
      </div>

      {!data ? (
        <div className="paper-analytics-empty">
          <strong>Phase 6-1 V2 데이터가 아직 표시되지 않습니다.</strong>
          <span>
            {error
              ? `조회 오류: ${error}`
              : "Worker의 Strategy Performance Analyzer를 실행하면 최신 V2 스냅샷을 자동으로 불러옵니다."}
          </span>
        </div>
      ) : (
        <>
          <div className="paper-analytics-kpis">
            <div><span>승률</span><strong>{data.win_rate === null ? "—" : `${formatNumber(data.win_rate, 2)}%`}</strong><small>{data.winning_trades}승 / {data.losing_trades}패</small></div>
            <div><span>Profit Factor</span><strong>{data.profit_factor === null ? "—" : formatNumber(data.profit_factor, 2)}</strong><small>1.0 이상이면 총이익 우위</small></div>
            <div><span>평균 보유시간</span><strong>{secondsLabel(data.average_holding_seconds)}</strong><small>최대 {secondsLabel(data.max_holding_seconds)}</small></div>
            <div><span>순손익</span><strong className={data.net_pnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(data.net_pnl)} USDT</strong><small>평균 수익률 {data.average_return_percent === null ? "—" : formatPercent(data.average_return_percent, 2)}</small></div>
            <div><span>MDD</span><strong className="paper-negative">{data.max_drawdown_percent === null ? "—" : formatPercent(-Math.abs(data.max_drawdown_percent), 2)}</strong><small>최대 낙폭</small></div>
          </div>

          <div className="paper-analytics-grid">
            <article>
              <h3>LONG / SHORT 성과</h3>
              <div className="paper-analysis-table">
                <div className="head"><span>방향</span><span>거래</span><span>승률</span><span>순손익</span><span>PF</span></div>
                {data.side_performance.map((row) => (
                  <div key={row.side ?? "side"}>
                    <span><b className={`paper-side ${row.side ?? "long"}`}>{row.side === "short" ? "숏" : "롱"}</b></span>
                    <span>{row.totalTrades}</span>
                    <span>{row.winRate === null ? "—" : `${formatNumber(row.winRate, 1)}%`}</span>
                    <span className={row.netPnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(row.netPnl)}</span>
                    <span>{row.profitFactor === null ? "—" : formatNumber(row.profitFactor, 2)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article>
              <h3>Confidence 구간별 성과</h3>
              <div className="paper-analysis-table">
                <div className="head"><span>구간</span><span>거래</span><span>승률</span><span>평균수익</span><span>PF</span></div>
                {data.confidence_performance.map((row) => (
                  <div key={row.bucket ?? "bucket"} className={row.totalTrades === 0 ? "muted" : ""}>
                    <span>{row.bucket ?? "—"}</span>
                    <span>{row.totalTrades}</span>
                    <span>{row.winRate === null ? "—" : `${formatNumber(row.winRate, 1)}%`}</span>
                    <span className={(row.averageReturnPercent ?? 0) >= 0 ? "paper-positive" : "paper-negative"}>{row.averageReturnPercent === null ? "—" : formatPercent(row.averageReturnPercent, 2)}</span>
                    <span>{row.profitFactor === null ? "—" : formatNumber(row.profitFactor, 2)}</span>
                  </div>
                ))}
              </div>
            </article>

            <article>
              <h3>청산 사유별 성과</h3>
              <div className="paper-exit-reasons">
                {data.exit_reason_performance.length ? data.exit_reason_performance.map((row) => (
                  <div key={row.reason ?? "reason"}>
                    <span><b>{closeReasonLabel(row.reason)}</b><small>{row.totalTrades}건 · 승률 {row.winRate === null ? "—" : `${formatNumber(row.winRate, 1)}%`}</small></span>
                    <strong className={row.netPnl >= 0 ? "paper-positive" : "paper-negative"}>{signed(row.netPnl)} USDT</strong>
                  </div>
                )) : <p>청산 데이터가 아직 없습니다.</p>}
              </div>
            </article>
          </div>

          <div className="paper-sample-progress">
            <div><span>현재 {data.total_trades}건</span><span>Provisional까지 {data.trades_until_provisional}건 · Ready까지 {data.trades_until_ready}건</span></div>
            <i><b style={{ width: `${Math.min(100, (data.total_trades / 50) * 100)}%` }} /></i>
          </div>
        </>
      )}
    </section>
  );
}
