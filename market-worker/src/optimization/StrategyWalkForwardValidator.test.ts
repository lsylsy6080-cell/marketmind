import {
  validateStrategyCandidatesWalkForward,
  type WalkForwardOptions,
} from "./StrategyWalkForwardValidator";
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
      Date.parse("2026-01-01T00:00:00.000Z") + index * 60_000,
    ).toISOString(),
    finalScore: 75,
    finalConfidence: 85,
    direction: "bullish",
    action: "buy",
    tradingPermission: "allowed",
    marketReturnPercent: getReturn(index),
  }));
}

const lowMinimums: WalkForwardOptions = {
  trainingRatio: 0.7,
  minimumTrainingTrades: 3,
  minimumValidationTrades: 2,
};

const tests: ReadonlyArray<{ name: string; run: () => void }> = [
  {
    name: "시간순 앞 70%와 뒤 30%를 분리한다",
    run: () => {
      const [result] = validateStrategyCandidatesWalkForward(
        observations(10, () => 1),
        [DEFAULT_STRATEGY_CANDIDATES[0]],
        lowMinimums,
      );
      assert(result.trainingObservationCount === 7, "학습 구간 크기 오류");
      assert(result.validationObservationCount === 3, "검증 구간 크기 오류");
      assert(
        result.splitAt === "2026-01-01T00:07:00.000Z",
        "분리 시점 오류",
      );
    },
  },
  {
    name: "양 구간 성과가 유지되면 robust로 판정한다",
    run: () => {
      const [result] = validateStrategyCandidatesWalkForward(
        observations(10, (index) => (index % 4 === 0 ? -0.2 : 1)),
        [DEFAULT_STRATEGY_CANDIDATES[0]],
        lowMinimums,
      );
      assert(result.robustnessStatus === "robust", result.reason);
      assert(result.validationEligible, "안정 후보가 검증에서 제외됐습니다.");
    },
  },
  {
    name: "학습 수익 후 검증 손실은 overfit으로 판정한다",
    run: () => {
      const [result] = validateStrategyCandidatesWalkForward(
        observations(10, (index) => (index < 7 ? 1 : -1)),
        [DEFAULT_STRATEGY_CANDIDATES[0]],
        lowMinimums,
      );
      assert(result.robustnessStatus === "overfit", "과최적화 감지 실패");
      assert(!result.validationEligible, "과최적화 후보가 통과했습니다.");
    },
  },
  {
    name: "기본 최소 표본을 충족하지 못하면 insufficient다",
    run: () => {
      const [result] = validateStrategyCandidatesWalkForward(
        observations(20, () => 1),
        [DEFAULT_STRATEGY_CANDIDATES[0]],
      );
      assert(result.robustnessStatus === "insufficient", "표본 판정 오류");
      assert(!result.validationEligible, "부족한 표본이 검증을 통과했습니다.");
    },
  },
  {
    name: "입력 순서와 무관하게 시간순으로 분리한다",
    run: () => {
      const source = observations(10, (index) => (index < 7 ? 1 : -1)).reverse();
      const [result] = validateStrategyCandidatesWalkForward(
        source,
        [DEFAULT_STRATEGY_CANDIDATES[0]],
        lowMinimums,
      );
      assert(result.robustnessStatus === "overfit", "시간 정렬이 적용되지 않았습니다.");
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`[PASS] ${test.name}`);
}

console.log(`[DONE] Strategy Walk-Forward Validator ${tests.length}개 검증 통과`);
