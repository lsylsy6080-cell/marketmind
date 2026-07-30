import {
  formatDateTime,
  formatNumber,
  formatRelativeTime,
  getMarketPressure,
  getStrategy,
  getTone,
  normalizeLabel,
} from "../format";
import type { FinalMarketDecision, JsonValue } from "../types";

type ScoreRow = {
  label: string;
  score: number | null;
  weight: number | null;
  contribution: number | null;
  verdict: string;
  tone: string;
};

function toObject(value: JsonValue): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toArray(value: JsonValue): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberFrom(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildScoreRows(decision: FinalMarketDecision): ScoreRow[] {
  const rows = [
    {
      label: "기술적 분석",
      score: decision.technical_score,
      weight: decision.technical_weight,
      verdict: normalizeLabel(decision.direction),
      tone: getTone(decision.direction),
    },
    {
      label: "뉴스 분석",
      score: decision.news_score,
      weight: decision.news_weight,
      verdict:
        (decision.news_score ?? 50) >= 60
          ? "긍정"
          : (decision.news_score ?? 50) <= 40
            ? "부정"
            : "중립",
      tone:
        (decision.news_score ?? 50) >= 60
          ? "positive"
          : (decision.news_score ?? 50) <= 40
            ? "negative"
            : "neutral",
    },
    {
      label: "펀딩 분석",
      score: decision.funding_score,
      weight: decision.funding_weight,
      verdict:
        (decision.funding_score ?? 50) >= 60
          ? "긍정"
          : (decision.funding_score ?? 50) <= 40
            ? "주의"
            : "중립",
      tone:
        (decision.funding_score ?? 50) >= 60
          ? "positive"
          : (decision.funding_score ?? 50) <= 40
            ? "warning"
            : "neutral",
    },
  ];

  return rows.map((row) => {
    const normalizedWeight =
      row.weight === null
        ? null
        : row.weight <= 1
          ? row.weight
          : row.weight / 100;

    return {
      ...row,
      contribution:
        row.score === null || normalizedWeight === null
          ? null
          : row.score * normalizedWeight,
    };
  });
}

function buildReadableReasons(decision: FinalMarketDecision): string[] {
  const reasons = toArray(decision.decision_reasons);

  if (reasons.length === 0) {
    return [
      "기술적·뉴스·펀딩 신호를 종합해 최종 판단을 계산했습니다.",
      "신뢰도와 거래 권한을 함께 확인해 진입 여부를 판단합니다.",
    ];
  }

  return reasons.slice(0, 6).map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return String(item);

    const obj = item as Record<string, unknown>;
    const type = String(obj.type ?? "analysis");
    const score = numberFrom(obj.score);
    const direction = normalizeLabel(
      typeof obj.direction === "string" ? obj.direction : null,
    );
    const regime = normalizeLabel(
      typeof obj.regime === "string" ? obj.regime : null,
    );

    const titleMap: Record<string, string> = {
      technical: "기술적 분석",
      news: "뉴스 분석",
      funding: "펀딩 분석",
      permission: "거래 권한",
      weighting: "가중치 판단",
    };

    const parts = [
      titleMap[type] ?? type,
      score !== null ? `점수 ${score.toFixed(1)}` : null,
      direction !== "데이터 없음" ? direction : null,
      regime !== "데이터 없음" ? regime : null,
    ].filter(Boolean);

    return parts.join(" · ");
  });
}

function buildNewsCards(decision: FinalMarketDecision) {
  const details = toObject(decision.score_details);
  const candidates = [
    details.news_event_summary,
    details.news,
    details.news_articles,
    details.categorized_articles,
  ];

  const source = candidates.find(Array.isArray) as unknown[] | undefined;
  if (!source) return [];

  return source.slice(0, 5).map((item, index) => {
    const obj =
      item && typeof item === "object"
        ? (item as Record<string, unknown>)
        : {};

    return {
      id: String(obj.id ?? index),
      source: String(obj.source ?? obj.publisher ?? "Market News"),
      title: String(
        obj.headline ??
          obj.title ??
          obj.summary ??
          "시장 관련 주요 뉴스",
      ),
      impact: numberFrom(
        obj.impact ??
          obj.importance ??
          obj.score ??
          obj.final_weight,
      ),
      category: String(obj.category ?? "market"),
    };
  });
}

function extractTechnicalMetrics(decision: FinalMarketDecision) {
  const details = toObject(decision.score_details);
  const technical = toObject(
    (details.technical as JsonValue) ??
      (details.technical_metrics as JsonValue) ??
      {},
  );

  const metric = (key: string, fallback = "—") => {
    const value = technical[key] ?? details[key];
    return value === null || value === undefined ? fallback : String(value);
  };

  return [
    { label: "EMA20", value: metric("ema20"), note: "단기 추세" },
    { label: "RSI", value: metric("rsi"), note: "모멘텀" },
    { label: "MACD", value: metric("macd"), note: "추세 신호" },
    { label: "ADX", value: metric("adx"), note: "추세 강도" },
    { label: "ATR", value: metric("atr"), note: "변동성" },
  ];
}

function Badge({ value, tone }: { value: string; tone: string }) {
  return <span className={`table-badge badge-${tone}`}>{value}</span>;
}

export function RecentDecisions({
  decisions,
}: {
  decisions: FinalMarketDecision[];
}) {
  return (
    <section className="panel table-panel recent-v25">
      <div className="table-heading">
        <h2>최근 AI 판단 목록</h2>
        <span>행을 누르면 정리된 판단 리포트가 열립니다.</span>
      </div>

      <div className="recent-table-head">
        <span>판단 시간</span>
        <span>최종 신호</span>
        <span>점수</span>
        <span>신뢰도</span>
        <span>시장 국면</span>
        <span>추천 전략</span>
        <span />
      </div>

      <div className="decision-accordion">
        {decisions.map((decision) => {
          const pressure = getMarketPressure(decision.market_regime);
          const strategy = getStrategy(
            decision.direction,
            decision.trading_permission,
          );
          const reasons = buildReadableReasons(decision);
          const newsCards = buildNewsCards(decision);
          const scoreRows = buildScoreRows(decision);
          const technicalMetrics = extractTechnicalMetrics(decision);

          return (
            <details className="decision-details" key={decision.id}>
              <summary>
                <div className="recent-time-cell">
                  <strong>{formatDateTime(decision.decided_at)}</strong>
                  <small>{formatRelativeTime(decision.decided_at)}</small>
                </div>

                <Badge
                  value={normalizeLabel(decision.action)}
                  tone={getTone(decision.action)}
                />

                <div className="recent-metric-cell">
                  <strong>{formatNumber(decision.final_score, 1)}</strong>
                  <small>Final Score</small>
                </div>

                <div className="recent-metric-cell confidence-cell">
                  <strong>{formatNumber(decision.final_confidence, 1)}%</strong>
                  <small>Confidence</small>
                </div>

                <Badge
                  value={normalizeLabel(decision.market_regime)}
                  tone="accent"
                />

                <Badge
                  value={strategy.title}
                  tone={
                    decision.trading_permission === "blocked"
                      ? "negative"
                      : decision.trading_permission === "caution"
                        ? "warning"
                        : "positive"
                  }
                />

                <span className="details-arrow">⌄</span>
              </summary>

              <div className="decision-detail-body">
                <div className="detail-header">
                  <div>
                    <span>판단 상세</span>
                    <strong>{normalizeLabel(decision.action)}</strong>
                  </div>
                  <div className="detail-header-meta">
                    <span>{formatDateTime(decision.decided_at)}</span>
                    <Badge
                      value={normalizeLabel(decision.trading_permission)}
                      tone={getTone(decision.trading_permission)}
                    />
                  </div>
                </div>

                <div className="report-grid">
                  <div className="report-column">
                    <section className="report-card">
                      <span className="report-label">AI 핵심 결론</span>
                      <div className="summary-stack">
                        <div>
                          <small>시장 국면</small>
                          <strong>{normalizeLabel(decision.market_regime)}</strong>
                          <p>{pressure.description}</p>
                        </div>
                        <div>
                          <small>시장 압력</small>
                          <strong>{pressure.title}</strong>
                          <p>{pressure.tag}</p>
                        </div>
                        <div>
                          <small>추천 전략</small>
                          <strong>{strategy.title}</strong>
                          <p>{strategy.description}</p>
                        </div>
                        <div>
                          <small>AI 한줄 요약</small>
                          <strong className="compact-summary">
                            {decision.decision_summary ??
                              "현재 신호를 종합해 보수적인 대응이 필요합니다."}
                          </strong>
                        </div>
                      </div>
                    </section>

                    <section className="report-card">
                      <span className="report-label">기술적 분석 요약</span>
                      <div className="technical-metric-grid">
                        {technicalMetrics.map((metric) => (
                          <div key={metric.label}>
                            <small>{metric.label}</small>
                            <strong>{metric.value}</strong>
                            <span>{metric.note}</span>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="report-card">
                      <span className="report-label">판단 근거</span>
                      <ul className="reason-list">
                        {reasons.map((reason, index) => (
                          <li key={`${decision.id}-reason-${index}`}>
                            <span>{index + 1}</span>
                            <p>{reason}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  </div>

                  <div className="report-column">
                    <section className="report-card">
                      <span className="report-label">Score Contribution</span>
                      <div className="contribution-bars">
                        {scoreRows.map((row) => {
                          const weight =
                            row.weight === null
                              ? 0
                              : row.weight <= 1
                                ? row.weight * 100
                                : row.weight;

                          return (
                            <div key={`${row.label}-bar`}>
                              <div>
                                <span>{row.label}</span>
                                <strong>{formatNumber(weight, 1)}%</strong>
                              </div>
                              <div className="contribution-track">
                                <span style={{ width: `${Math.min(weight, 100)}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>

                    <section className="report-card">
                      <span className="report-label">점수 상세</span>
                      <div className="score-table">
                        <div className="score-table-head">
                          <span>항목</span>
                          <span>점수</span>
                          <span>가중치</span>
                          <span>기여도</span>
                          <span>판단</span>
                        </div>

                        {scoreRows.map((row) => (
                          <div className="score-table-row" key={row.label}>
                            <strong>{row.label}</strong>
                            <span>{formatNumber(row.score, 1)}</span>
                            <span>
                              {row.weight === null
                                ? "—"
                                : `${formatNumber(
                                    row.weight <= 1 ? row.weight * 100 : row.weight,
                                    1,
                                  )}%`}
                            </span>
                            <span>{formatNumber(row.contribution, 1)}</span>
                            <Badge value={row.verdict} tone={row.tone} />
                          </div>
                        ))}

                        <div className="score-table-row final-row">
                          <strong>최종 점수</strong>
                          <span>{formatNumber(decision.final_score, 1)}</span>
                          <span>100%</span>
                          <span>{formatNumber(decision.final_score, 1)}</span>
                          <Badge
                            value={normalizeLabel(decision.action)}
                            tone={getTone(decision.action)}
                          />
                        </div>
                      </div>
                    </section>

                    <section className="report-card">
                      <span className="report-label">뉴스 인텔리전스</span>
                      {newsCards.length > 0 ? (
                        <div className="news-card-list">
                          {newsCards.map((news) => (
                            <article className="news-card" key={news.id}>
                              <div>
                                <span>{news.source}</span>
                                <strong>{news.title}</strong>
                                <small>{news.category}</small>
                              </div>
                              <div className="news-impact">
                                <span>영향도</span>
                                <strong>
                                  {news.impact === null
                                    ? "—"
                                    : formatNumber(news.impact, 1)}
                                </strong>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="news-empty">
                          저장된 뉴스 상세 데이터가 없습니다.
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
