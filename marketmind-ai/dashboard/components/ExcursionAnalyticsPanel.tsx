import { formatNumber } from "../format";
import type { ExcursionDistributionBucket, StrategyPerformanceSnapshot } from "../types";

type Props = {
  data: StrategyPerformanceSnapshot | null;
};

function pct(value: number | null | undefined, sign = false) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const prefix = sign && n > 0 ? "+" : "";
  return `${prefix}${formatNumber(n, 2)}%`;
}

function opportunity(value: number | null, trades: number, samples: number) {
  if (samples === 0 || value == null) return "데이터 대기";
  return `${formatNumber(value, 1)}% · ${trades}건`;
}

function Distribution({ title, rows, samples, kind }: {
  title: string;
  rows: ExcursionDistributionBucket[];
  samples: number;
  kind: "mfe" | "mae";
}) {
  const maxTrades = Math.max(1, ...rows.map((row) => row.trades));
  return (
    <article className="excursion-distribution">
      <div className="excursion-card-head">
        <h3>{title}</h3>
        <span>{samples > 0 ? `${samples}건 기준` : "표본 대기"}</span>
      </div>
      <div className="excursion-bars">
        {rows.map((row) => {
          const width = samples > 0 ? (row.trades / maxTrades) * 100 : 0;
          return (
            <div className="excursion-bar-row" key={`${kind}-${row.bucket}`}>
              <span>{row.bucket}%</span>
              <i><b className={kind} style={{ width: `${width}%` }} /></i>
              <strong>{samples > 0 ? `${row.trades}건` : "—"}</strong>
              <small>{samples > 0 && row.rate != null ? `${formatNumber(row.rate, 1)}%` : ""}</small>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function ExcursionAnalyticsPanel({ data }: Props) {
  const metrics = data?.excursion_metrics ?? null;
  const samples = metrics?.samples ?? 0;

  return (
    <section className="panel excursion-analytics">
      <div className="excursion-head">
        <div>
          <span className="section-kicker">TRADE EXCURSION ANALYTICS</span>
          <h2>MFE / MAE 분석 <small>Phase 6-2D</small></h2>
          <p>종료 거래가 실제로 어디까지 수익·손실 방향으로 움직였는지 추적해 TP/SL과 보호 청산 기준을 검증합니다.</p>
        </div>
        <span className={`excursion-sample-badge ${samples > 0 ? "active" : ""}`}>
          추적 완료 {samples}건
        </span>
      </div>

      {!metrics ? (
        <div className="excursion-empty">
          <strong>Phase 6-2C 통계 스냅샷을 기다리고 있습니다.</strong>
          <span>Worker의 Strategy Performance Analyzer를 실행하면 excursion_metrics가 이 영역에 표시됩니다.</span>
        </div>
      ) : (
        <>
          <div className="excursion-kpis">
            <div><span>평균 MFE</span><strong className="paper-positive">{pct(metrics.averageMfePercent, true)}</strong><small>중앙값 {pct(metrics.medianMfePercent, true)}</small></div>
            <div><span>평균 MAE</span><strong className="paper-negative">{pct(metrics.averageMaePercent)}</strong><small>중앙값 {pct(metrics.medianMaePercent)}</small></div>
            <div><span>TP 도달률</span><strong>{metrics.tpReachRate == null ? "—" : `${formatNumber(metrics.tpReachRate, 1)}%`}</strong><small>{metrics.tpReachTrades}건 · 목표 +{formatNumber(metrics.tpTargetPercent ?? 0, 2)}%</small></div>
            <div><span>SL 도달률</span><strong>{metrics.slReachRate == null ? "—" : `${formatNumber(metrics.slReachRate, 1)}%`}</strong><small>{metrics.slReachTrades}건 · 목표 -{formatNumber(metrics.slTargetPercent ?? 0, 2)}%</small></div>
          </div>

          <div className="excursion-targets">
            <div><span>Break-even 활성</span><strong>+{formatNumber(metrics.breakEvenActivationPercent ?? 0, 2)}%</strong><small>{opportunity(metrics.breakEvenOpportunityRate, metrics.breakEvenOpportunityTrades, samples)}</small></div>
            <div><span>Trailing 활성</span><strong>+{formatNumber(metrics.trailingActivationPercent ?? 0, 2)}%</strong><small>{opportunity(metrics.trailingOpportunityRate, metrics.trailingOpportunityTrades, samples)}</small></div>
            <div><span>MFE 25% / 75%</span><strong>{pct(metrics.p25MfePercent, true)} / {pct(metrics.p75MfePercent, true)}</strong><small>최대 {pct(metrics.maxMfePercent, true)}</small></div>
            <div><span>MAE 25% / 75%</span><strong>{pct(metrics.p25MaePercent)} / {pct(metrics.p75MaePercent)}</strong><small>최악 {pct(metrics.minMaePercent)}</small></div>
          </div>

          {samples === 0 ? (
            <div className="excursion-empty waiting">
              <strong>MFE/MAE 추적이 완료된 종료 거래가 아직 없습니다.</strong>
              <span>Phase 6-2B 이후 열린 포지션이 청산되면 평균값·도달률·분포가 자동으로 채워집니다. 기존 거래를 0%로 보정하지 않습니다.</span>
            </div>
          ) : null}

          <div className="excursion-grid">
            <Distribution title="MFE 분포 · 최대 유리 움직임" rows={metrics.mfeDistribution} samples={samples} kind="mfe" />
            <Distribution title="MAE 분포 · 최대 불리 움직임" rows={metrics.maeDistribution} samples={samples} kind="mae" />
          </div>
        </>
      )}
    </section>
  );
}
