import { recommendStrategy } from "./StrategyRecommendationEngine";
import { validateStrategyCandidatesWalkForward } from "./StrategyWalkForwardValidator";
import {
  DEFAULT_STRATEGY_CANDIDATES,
  type HistoricalDecisionObservation,
} from "./StrategyCandidateComparator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function observations(
  count: number,
  getReturn: (index: number) => number,
): HistoricalDecisionObservation[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    decidedAt: new Date(
      Date.parse("2026-01-01T00:00:00Z") + index * 60_000,
    ).toISOString(),
    finalScore: 75,
    finalConfidence: 85,
    direction: "bullish",
    action: "buy",
    tradingPermission: "allowed",
    marketReturnPercent: getReturn(index),
  }));
}

const tests: ReadonlyArray<{ name: string; run: () => void }> = [
  {
    name: "표본 부족이면 추천을 보류한다",
    run: () => {
      const validation = validateStrategyCandidatesWalkForward(
        observations(20, () => 1),
      );
      const recommendation = recommendStrategy(validation);
      assert(recommendation.status === "hold", "부족한 표본을 추천했습니다.");
      assert(recommendation.selectedCandidateKey === null, "후보가 선택됐습니다.");
    },
  },
  {
    name: "검증 통과 후보 중 종합 점수가 가장 높은 후보를 추천한다",
    run: () => {
      const validation = validateStrategyCandidatesWalkForward(
        observations(80, (index) => (index % 5 === 0 ? -0.2 : 1)),
      );
      const recommendation = recommendStrategy(validation);
      assert(recommendation.status === "recommended", recommendation.reason);
      assert(
        recommendation.selectedCandidateKind === "aggressive",
        "포지션 크기 성과가 추천 점수에 반영되지 않았습니다.",
      );
    },
  },
  {
    name: "과최적화 후보는 추천 순위에서 제외한다",
    run: () => {
      const validation = validateStrategyCandidatesWalkForward(
        observations(80, (index) => (index < 56 ? 1 : -1)),
      );
      const recommendation = recommendStrategy(validation);
      assert(recommendation.status === "hold", "과최적화 후보를 추천했습니다.");
      assert(
        recommendation.rankings.every((row) => !row.eligible),
        "과최적화 후보가 순위에 포함됐습니다.",
      );
    },
  },
  {
    name: "추천 결과에 모든 후보의 탈락 또는 선정 근거를 남긴다",
    run: () => {
      const validation = validateStrategyCandidatesWalkForward(
        observations(20, () => 1),
        DEFAULT_STRATEGY_CANDIDATES,
      );
      const recommendation = recommendStrategy(validation);
      assert(recommendation.rankings.length === 3, "후보 근거가 누락됐습니다.");
      assert(
        recommendation.rankings.every((row) => row.reason.length > 0),
        "후보 사유가 비어 있습니다.",
      );
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`[PASS] ${test.name}`);
}
console.log(`[DONE] Strategy Recommendation Engine ${tests.length}개 검증 통과`);
