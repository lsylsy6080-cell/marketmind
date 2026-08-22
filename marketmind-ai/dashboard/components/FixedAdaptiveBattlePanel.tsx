import type {
  BattleMetrics,
  FixedAdaptiveBattleData,
} from "../fixed-adaptive-battle-data";
import styles from "./FixedAdaptiveBattlePanel.module.css";

const f = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);

function winnerLabel(data: FixedAdaptiveBattleData) {
  if (data.status === "warming_up") return "WARMING UP";
  if (data.status === "unavailable") return "WAITING";
  if (data.winner === "adaptive") return "ADAPTIVE LEADING";
  if (data.winner === "fixed") return "FIXED LEADING";
  if (data.winner === "tie") return "TIE";
  return "INCONCLUSIVE";
}

function MetricColumn({
  title,
  metrics,
  score,
  adaptive = false,
}: {
  title: string;
  metrics: BattleMetrics | null;
  score: number | null;
  adaptive?: boolean;
}) {
  const rows = [
    ["누적 수익률", metrics ? `${f(metrics.netReturnPercent)}%` : "—"],
    ["Net PnL", metrics ? `${metrics.netPnl >= 0 ? "+" : ""}${f(metrics.netPnl)} USDT` : "—"],
    ["승률", metrics?.winRate == null ? "—" : `${f(metrics.winRate)}%`],
    ["Profit Factor", f(metrics?.profitFactor)],
    ["MDD", metrics ? `${f(metrics.maxDrawdownPercent)}%` : "—"],
    ["기대수익", metrics?.expectancyPercent == null ? "—" : `${f(metrics.expectancyPercent)}%`],
    ["평균 손익", metrics?.averagePnl == null ? "—" : `${f(metrics.averagePnl)} USDT`],
    ["거래 수", metrics ? String(metrics.totalTrades) : "0"],
  ];

  if (adaptive) {
    rows.push(
      ["평균 레버리지", metrics?.averageLeverage == null ? "—" : `${f(metrics.averageLeverage)}x`],
      ["안전 하향률", metrics?.leverageAdjustmentRate == null ? "—" : `${f(metrics.leverageAdjustmentRate)}%`],
    );
  }

  return (
    <article className={`${styles.strategy} ${adaptive ? styles.adaptive : ""}`}>
      <header>
        <span>{adaptive ? "DYNAMIC RISK" : "BASELINE"}</span>
        <strong>{title}</strong>
        <b>{score == null ? "—" : f(score, 1)}</b>
      </header>
      <div className={styles.metrics}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

export function FixedAdaptiveBattlePanel({
  data,
}: {
  data: FixedAdaptiveBattleData;
}) {
  const fixedCount = data.fixed?.totalTrades ?? 0;
  const adaptiveCount = data.adaptive?.totalTrades ?? 0;
  const min = Math.max(1, data.minimumTradesRequired);
  const progress = Math.min(
    100,
    Math.round((Math.min(fixedCount, adaptiveCount) / min) * 100),
  );

  return (
    <section className={`${styles.panel} panel`}>
      <header className={styles.title}>
        <div>
          <span className="section-kicker">FORWARD PAPER BATTLE</span>
          <h2>Fixed vs Adaptive</h2>
          <p>동일한 Forward 기간에서 고정 전략과 Adaptive 전략의 실제 모의매매 성과를 비교합니다.</p>
        </div>
        <div className={`${styles.badge} ${styles[data.winner] ?? ""}`}>
          <small>BATTLE STATUS</small>
          <strong>{winnerLabel(data)}</strong>
        </div>
      </header>

      {data.error ? (
        <div className={styles.notice}>
          Battle 데이터 대기 중
          <small>{data.error}</small>
        </div>
      ) : (
        <>
          <div className={styles.progressHead}>
            <span>승자 판정 최소 표본</span>
            <strong>
              Fixed {fixedCount}/{min} · Adaptive {adaptiveCount}/{min}
            </strong>
          </div>
          <div className={styles.progress}>
            <i style={{ width: `${progress}%` }} />
          </div>

          <div className={styles.grid}>
            <MetricColumn
              title="FIXED"
              metrics={data.fixed}
              score={data.fixedScore?.total ?? null}
            />
            <div className={styles.vs}>
              <span>VS</span>
              <small>종합점수</small>
            </div>
            <MetricColumn
              title="ADAPTIVE"
              metrics={data.adaptive}
              score={data.adaptiveScore?.total ?? null}
              adaptive
            />
          </div>

          <footer className={styles.footer}>
            <div>
              {(data.reasons.length
                ? data.reasons
                : data.status === "warming_up"
                  ? ["아직 표본을 수집 중입니다. 최소 거래 수를 채우기 전에는 승자를 확정하지 않습니다."]
                  : ["Battle Worker 결과를 기다리고 있습니다."]
              ).slice(0, 3).map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
            <small>
              {data.analyzedAt
                ? new Date(data.analyzedAt).toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                  })
                : "분석 대기"}
            </small>
          </footer>
        </>
      )}
    </section>
  );
}
