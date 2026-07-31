import {
  compareStrategyCandidate,
  compareStrategyCandidates,
  DEFAULT_STRATEGY_CANDIDATES,
  type HistoricalDecisionObservation,
} from "./StrategyCandidateComparator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const bullish: HistoricalDecisionObservation = {
  id: 1,
  decidedAt: "2026-07-01T00:00:00.000Z",
  finalScore: 75,
  finalConfidence: 80,
  direction: "bullish",
  action: "buy",
  tradingPermission: "allowed",
  marketReturnPercent: 2,
};

const tests: ReadonlyArray<{ name: string; run: () => void }> = [
  {
    name: "기본 세 가지 전략 후보를 모두 비교한다",
    run: () => {
      const results = compareStrategyCandidates([bullish]);
      assert(results.length === 3, "기본 후보 개수가 올바르지 않습니다.");
      assert(
        results.map((result) => result.candidate.kind).join(",") ===
          "conservative,balanced,aggressive",
        "후보 순서가 바뀌었습니다.",
      );
    },
  },
  {
    name: "포지션 크기에 따라 후보 수익률이 달라진다",
    run: () => {
      const results = compareStrategyCandidates([bullish]);
      assert(
        results[2].cumulativeReturnPercent >
          results[1].cumulativeReturnPercent,
        "공격형 포지션 크기가 수익률에 반영되지 않았습니다.",
      );
      assert(
        results[1].cumulativeReturnPercent >
          results[0].cumulativeReturnPercent,
        "균형형 포지션 크기가 수익률에 반영되지 않았습니다.",
      );
    },
  },
  {
    name: "수수료와 슬리피지를 왕복 비용으로 차감한다",
    run: () => {
      const result = compareStrategyCandidate(
        {
          ...DEFAULT_STRATEGY_CANDIDATES[1],
          positionSizePercent: 100,
          feeRatePercent: 0.1,
          slippagePercent: 0.05,
        },
        [bullish],
      );

      assert(
        result.cumulativeReturnPercent === 1.7,
        `비용 차감 결과가 올바르지 않습니다: ${result.cumulativeReturnPercent}`,
      );
    },
  },
  {
    name: "blocked 판단과 낮은 신뢰도 판단은 진입하지 않는다",
    run: () => {
      const result = compareStrategyCandidate(
        DEFAULT_STRATEGY_CANDIDATES[1],
        [
          { ...bullish, tradingPermission: "blocked" },
          { ...bullish, id: 2, finalConfidence: 20 },
        ],
      );
      assert(result.selectedTrades === 0, "차단 판단으로 후보가 진입했습니다.");
      assert(result.skippedObservations === 2, "제외 표본 수가 잘못됐습니다.");
    },
  },
  {
    name: "SHORT 후보는 하락 수익률을 양의 전략 수익률로 평가한다",
    run: () => {
      const result = compareStrategyCandidate(
        DEFAULT_STRATEGY_CANDIDATES[1],
        [
          {
            ...bullish,
            finalScore: 25,
            direction: "bearish",
            action: "sell",
            marketReturnPercent: -3,
          },
        ],
      );
      assert(
        result.cumulativeReturnPercent > 0,
        "SHORT 방향 수익률이 반대로 계산되지 않았습니다.",
      );
    },
  },
  {
    name: "30회 미만 후보는 최적화 대상에서 제외한다",
    run: () => {
      const result = compareStrategyCandidate(
        DEFAULT_STRATEGY_CANDIDATES[1],
        Array.from({ length: 29 }, (_, index) => ({
          ...bullish,
          id: index + 1,
          decidedAt: new Date(
            Date.parse(bullish.decidedAt) + index * 60_000,
          ).toISOString(),
        })),
      );
      assert(result.sampleStatus === "insufficient", "표본 상태 오류");
      assert(!result.optimizationEligible, "부족한 표본이 최적화에 사용됐습니다.");
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`[PASS] ${test.name}`);
}

console.log(`[DONE] Strategy Candidate Comparator ${tests.length}개 검증 통과`);
