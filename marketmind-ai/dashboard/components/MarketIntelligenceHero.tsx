import {
  conflictLabel,
  directionLabel,
  formatPercent,
  riskLabel,
  signalLabel,
  toneClass,
} from "../format";
import type { MarketIntelligenceRow } from "../types";
import { ScoreGauge } from "./ScoreGauge";

export function MarketIntelligenceHero({ data }: { data: MarketIntelligenceRow }) {
  return (
    <section className="panel intelligence-hero">
      <div className="hero-copy">
        <div className="eyebrow">MARKET INTELLIGENCE v2.1</div>
        <h1>BTC 시장 종합 판단</h1>
        <p>{data.summary ?? "분석 요약이 아직 생성되지 않았습니다."}</p>
        <div className="hero-badges">
          <span className={`status-badge ${toneClass(data.signal)}`}>{signalLabel(data.signal)}</span>
          <span className={`status-badge ${toneClass(data.direction)}`}>{directionLabel(data.direction)}</span>
        </div>
      </div>

      <ScoreGauge score={Number(data.market_score)} />

      <div className="hero-metrics">
        <div><span>신뢰도</span><strong>{formatPercent(data.confidence, 1)}</strong></div>
        <div><span>합의도</span><strong>{formatPercent(data.consensus_strength, 0)}</strong></div>
        <div><span>위험 수준</span><strong className={toneClass(data.risk_level)}>{riskLabel(data.risk_level)}</strong></div>
        <div><span>지표 충돌</span><strong className={toneClass(data.conflict_level)}>{conflictLabel(data.conflict_level)}</strong></div>
      </div>
    </section>
  );
}
