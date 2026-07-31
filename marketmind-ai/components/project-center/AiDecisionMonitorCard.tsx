import styles from "./ProjectCenter.module.css";

export type AiDecisionSignal = "LONG" | "SHORT" | "WAIT";
export type AiDecisionRisk = "LOW" | "MEDIUM" | "HIGH";
export type AiDecisionTrend = "BULLISH" | "BEARISH" | "NEUTRAL";
export type AiDecisionPermission = "ALLOWED" | "CAUTION" | "BLOCKED";
export type AiDecisionAlignment = "ALIGNED" | "MIXED" | "CONFLICTED";
export type AiFactorState = "positive" | "negative" | "neutral" | "unavailable";

export type AiDecisionFactor = {
  key: string;
  label: string;
  score: number;
  weight?: number;
  state: AiFactorState;
  summary: string;
};

export type AiDecisionSnapshot = {
  id: string;
  symbol: string;
  timeframe: string;
  signal: AiDecisionSignal;
  action: string;
  confidence: number;
  marketScore: number;
  trend: AiDecisionTrend;
  risk: AiDecisionRisk;
  tradingPermission: AiDecisionPermission;
  alignment: AiDecisionAlignment;
  summary: string;
  factors: AiDecisionFactor[];
  generatedAt: string;
  modelVersion?: string;
};

type Props = {
  decision: AiDecisionSnapshot | null;
  checkedAt: string;
  source: string;
  error?: string;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "Asia/Seoul",
  }).format(date);
}

const signalLabel = (value: AiDecisionSignal) =>
  value === "LONG" ? "상승 우위" : value === "SHORT" ? "하락 우위" : "관망";
const trendLabel = (value: AiDecisionTrend) =>
  value === "BULLISH" ? "강세" : value === "BEARISH" ? "약세" : "중립";
const riskLabel = (value: AiDecisionRisk) =>
  value === "LOW" ? "낮음" : value === "HIGH" ? "높음" : "보통";
const permissionLabel = (value: AiDecisionPermission) =>
  value === "ALLOWED" ? "거래 허용" : value === "BLOCKED" ? "거래 차단" : "주의 필요";
const alignmentLabel = (value: AiDecisionAlignment) =>
  value === "ALIGNED" ? "신호 일치" : value === "CONFLICTED" ? "신호 충돌" : "신호 혼합";

export function AiDecisionMonitorCard({ decision, checkedAt, source, error }: Props) {
  if (!decision) {
    return (
      <article className={`${styles.osCard} ${styles.aiDecisionCard}`}>
        <div className={styles.cardHeader}><div><span className={styles.cardEyebrow}>AI BRAIN DASHBOARD</span><h2>최종 시장 판단</h2></div><span className={styles.decisionUnavailable}>DATA WAITING</span></div>
        <div className={styles.decisionEmptyState}><strong>최종 판단 데이터가 아직 없습니다.</strong><p>{error ?? "Worker 실행 후 final_market_decisions 데이터가 표시됩니다."}</p><small>마지막 확인 · {formatDateTime(checkedAt)}</small></div>
      </article>
    );
  }

  const confidence = clamp(decision.confidence);
  const marketScore = clamp(decision.marketScore);

  return (
    <article className={`${styles.osCard} ${styles.aiDecisionCard}`}>
      <div className={styles.aiDecisionGlow} aria-hidden="true" />
      <div className={styles.cardHeader}>
        <div><span className={styles.cardEyebrow}>AI BRAIN DASHBOARD</span><h2>최종 시장 판단</h2></div>
        <span className={`${styles.decisionSignalBadge} ${styles[`decisionSignal${decision.signal}`]}`}><i aria-hidden="true" />{decision.signal}</span>
      </div>

      <div className={styles.aiDecisionBody}>
        <div className={styles.decisionHero}>
          <div className={`${styles.decisionSignalWord} ${styles[`decisionSignalWord${decision.signal}`]}`}>
            <span>{decision.symbol} · {decision.timeframe}</span>
            <strong>{decision.signal}</strong>
            <small>{signalLabel(decision.signal)} · {decision.action.toUpperCase()}</small>
          </div>
          <div className={styles.decisionHeroMetrics}>
            <div>
              <span>MARKET SCORE</span>
              <strong>{marketScore}</strong>
              <div className={styles.decisionMetricTrack}><span style={{ width: `${marketScore}%` }} /></div>
            </div>
            <div>
              <span>CONFIDENCE</span>
              <strong>{confidence}<small>%</small></strong>
              <div className={styles.decisionMetricTrack}><span style={{ width: `${confidence}%` }} /></div>
            </div>
          </div>
        </div>

        <p className={styles.decisionSummary}>{decision.summary}</p>

        <div className={styles.decisionMetricGrid}>
          <div className={styles.decisionCompactMetric}><span>시장 방향</span><strong>{trendLabel(decision.trend)}</strong></div>
          <div className={styles.decisionCompactMetric}><span>위험도</span><strong>{riskLabel(decision.risk)}</strong></div>
        </div>

        <div className={styles.brainStatusGrid}>
          <div><span>거래 권한</span><strong>{permissionLabel(decision.tradingPermission)}</strong></div>
          <div><span>신호 정렬</span><strong>{alignmentLabel(decision.alignment)}</strong></div>
          <div><span>전략 버전</span><strong>{decision.modelVersion ?? "미지정"}</strong></div>
        </div>

        <div className={styles.decisionFactors}>
          <div className={styles.decisionSectionTitle}><span>인텔리전스 기여도</span><small>{decision.factors.length}개 분석 신호</small></div>
          <div className={styles.factorGrid}>
            {decision.factors.map((factor) => (
              <article className={styles.factorItem} key={factor.key}>
                <div className={styles.factorTop}><div><i className={styles[`factorState${factor.state}`]} aria-hidden="true" /><strong>{factor.label}</strong></div><span>{Math.round(factor.score * 100) / 100}</span></div>
                {factor.weight !== undefined ? <div className={styles.factorWeight}><span>가중치</span><strong>{Math.round(factor.weight * 100)}%</strong><div><i style={{ width: `${Math.max(0, Math.min(100, factor.weight * 100))}%` }} /></div></div> : null}
                <p>{factor.summary}</p>
              </article>
            ))}
          </div>
        </div>

        <footer className={styles.decisionFooter}><span>판단 생성 · {formatDateTime(decision.generatedAt)}</span><span>데이터 · {source}</span></footer>
      </div>
    </article>
  );
}
