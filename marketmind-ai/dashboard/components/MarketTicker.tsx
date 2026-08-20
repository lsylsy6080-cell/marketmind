import {
  formatPercent,
  normalizeLabel,
} from "../format";
import type { FinalMarketDecision, FundingSnapshot } from "../types";

export function MarketTicker({
  decision,
  funding,
  positionSide,
  positionCount = 0,
}: {
  decision: FinalMarketDecision;
  funding: FundingSnapshot | null;
  positionSide?: string | null;
  positionCount?: number;
}) {
  const fundingPercent =
    funding?.funding_rate_percent ??
    (funding?.funding_rate !== null && funding?.funding_rate !== undefined
      ? funding.funding_rate * 100
      : null);

  const confidence = decision.final_confidence ?? null;
  const signal = normalizeLabel(decision.direction);
  const position = positionSide ? positionSide.toUpperCase() : "대기";

  return (
    <section className="mm-kpi-grid mm-kpi-grid-3" aria-label="시장 핵심 지표">
      <article className="mm-kpi-card">
        <span>Funding Rate</span>
        <strong>{formatPercent(fundingPercent, 4)}</strong>
        <small>{normalizeLabel(funding?.risk_level ?? "NORMAL")}</small>
      </article>

      <article className="mm-kpi-card mm-kpi-signal">
        <span>AI 신호</span>
        <strong>{signal}</strong>
        <div className="mm-kpi-progress"><i style={{ width: `${Math.min(100, Math.max(0, Number(confidence ?? 0)))}%` }} /></div>
        <small>신뢰도 {confidence !== null ? `${Number(confidence).toFixed(0)}%` : "—"}</small>
      </article>

      <article className="mm-kpi-card">
        <span>포지션 상태</span>
        <strong className={positionSide ? (positionSide.toLowerCase() === "long" ? "paper-positive" : "paper-negative") : ""}>{position}</strong>
        <small>실제 유지 포지션 {positionCount}</small>
      </article>
    </section>
  );
}
