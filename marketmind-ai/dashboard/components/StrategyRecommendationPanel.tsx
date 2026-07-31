import type {
  StrategyRecommendationData,
  StrategyRecommendationRanking,
} from "../types";

type Props = { data: StrategyRecommendationData };
const nf = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

function rankingStatus(row: StrategyRecommendationRanking): string {
  if (row.eligible) return `${row.rank ?? "-"}위`;
  if (row.robustnessStatus === "overfit") return "과최적화 제외";
  return "표본 부족";
}

export function StrategyRecommendationPanel({ data }: Props) {
  if (data.error) {
    return (
      <section className="recommendation-panel">
        <h2>Phase 5-4 전략 추천</h2>
        <p className="strategy-compare-error">{data.error}</p>
      </section>
    );
  }

  const recommendation = data.recommendation;
  if (!recommendation) {
    return (
      <section className="recommendation-panel">
        <h2>Phase 5-4 전략 추천</h2>
        <p className="strategy-compare-empty">
          워커가 검증 결과를 평가하면 안전 추천 결과가 표시됩니다.
        </p>
      </section>
    );
  }

  const isHold = recommendation.recommendation_status === "hold";
  const rankings = Array.isArray(recommendation.candidate_rankings)
    ? recommendation.candidate_rankings
    : [];

  return (
    <section className={`recommendation-panel ${isHold ? "is-hold" : "is-recommended"}`}>
      <div className="recommendation-hero">
        <div>
          <span>STRATEGY RECOMMENDATION</span>
          <h2>Phase 5-4 최적 전략 추천</h2>
          <p>{recommendation.recommendation_reason}</p>
        </div>
        <div className="recommendation-result">
          <small>{isHold ? "현재 결정" : "추천 후보"}</small>
          <strong>
            {isHold
              ? "추천 보류"
              : recommendation.selected_candidate_name ?? "추천 보류"}
          </strong>
          <em>
            {isHold
              ? "표본·검증 기준 대기"
              : `종합 ${nf.format(recommendation.recommendation_score ?? 0)}점`}
          </em>
        </div>
      </div>

      <div className="recommendation-body">
        <div className="recommendation-rankings">
          {rankings.map((row) => (
            <article key={row.candidateKey}>
              <div>
                <span>{row.candidateKind.toUpperCase()}</span>
                <strong>{row.candidateName}</strong>
              </div>
              <b>{rankingStatus(row)}</b>
              <dl>
                <div><dt>종합 점수</dt><dd>{nf.format(row.score)}</dd></div>
                <div><dt>검증 거래</dt><dd>{row.validationTrades}회</dd></div>
                <div><dt>기대수익</dt><dd>{row.validationExpectedReturn === null ? "-" : `${nf.format(row.validationExpectedReturn)}%`}</dd></div>
                <div><dt>수익 팩터</dt><dd>{row.validationProfitFactor === null ? "-" : nf.format(row.validationProfitFactor)}</dd></div>
              </dl>
              <p>{row.reason}</p>
            </article>
          ))}
        </div>

        <aside className="manual-approval-card">
          <span>MANUAL APPROVAL LOCK</span>
          <strong>자동 적용 차단</strong>
          <p>
            추천 결과는 분석용입니다. 전략 임계값과 포지션 크기는 사용자가
            승인하기 전까지 변경되지 않습니다.
          </p>
          <div><span>추천 신뢰도</span><b>{nf.format(recommendation.recommendation_confidence)}%</b></div>
          <div><span>통과 후보</span><b>{recommendation.eligible_candidate_count}개</b></div>
        </aside>
      </div>
    </section>
  );
}
