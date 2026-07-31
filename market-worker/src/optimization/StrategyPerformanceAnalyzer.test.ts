import {
  analyzeStrategyPerformance,
  type ClosedTradeSample,
} from "./StrategyPerformanceAnalyzer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertClose(
  actual: number | null,
  expected: number,
  message: string,
): void {
  assert(actual !== null, `${message}: 값이 null입니다.`);
  assert(Math.abs(actual - expected) < 0.000001, `${message}: ${actual}`);
}

function makeTrades(
  count: number,
  result: (index: number) => { netPnl: number; returnPercent: number },
): ClosedTradeSample[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    ...result(index),
    closedAt: new Date(
      Date.parse("2026-07-01T00:00:00.000Z") + index * 60_000,
    ).toISOString(),
  }));
}

const tests: ReadonlyArray<{ name: string; run: () => void }> = [
  {
    name: "거래가 없으면 안전한 빈 성과를 반환한다",
    run: () => {
      const result = analyzeStrategyPerformance([]);
      assert(result.totalTrades === 0, "거래 수가 0이 아닙니다.");
      assert(result.winRate === null, "빈 표본의 승률이 생성됐습니다.");
      assert(result.sampleStatus === "insufficient", "표본 상태가 잘못됐습니다.");
      assert(!result.optimizationEligible, "빈 표본이 최적화에 사용됐습니다.");
    },
  },
  {
    name: "승률·기대손익·수익 팩터를 계산한다",
    run: () => {
      const result = analyzeStrategyPerformance([
        { id: 1, netPnl: 12, returnPercent: 1.2, closedAt: "2026-07-01T01:00:00Z" },
        { id: 2, netPnl: -4, returnPercent: -0.4, closedAt: "2026-07-01T02:00:00Z" },
        { id: 3, netPnl: 8, returnPercent: 0.8, closedAt: "2026-07-01T03:00:00Z" },
        { id: 4, netPnl: 0, returnPercent: 0, closedAt: "2026-07-01T04:00:00Z" },
      ]);

      assertClose(result.winRate, 66.666667, "승률 오류");
      assertClose(result.averagePnl, 4, "평균 손익 오류");
      assertClose(result.profitFactor, 5, "수익 팩터 오류");
      assert(result.breakevenTrades === 1, "본전 거래 집계 오류");
    },
  },
  {
    name: "30회와 50회 표본 경계를 구분한다",
    run: () => {
      const below = analyzeStrategyPerformance(
        makeTrades(29, () => ({ netPnl: 1, returnPercent: 0.1 })),
      );
      const provisional = analyzeStrategyPerformance(
        makeTrades(30, () => ({ netPnl: 1, returnPercent: 0.1 })),
      );
      const ready = analyzeStrategyPerformance(
        makeTrades(50, () => ({ netPnl: 1, returnPercent: 0.1 })),
      );

      assert(below.sampleStatus === "insufficient", "29회 상태 오류");
      assert(provisional.sampleStatus === "provisional", "30회 상태 오류");
      assert(provisional.optimizationEligible, "30회 분석 대상 누락");
      assert(ready.sampleStatus === "ready", "50회 상태 오류");
    },
  },
  {
    name: "연속 손실의 최대 낙폭과 손실 연속 횟수를 계산한다",
    run: () => {
      const result = analyzeStrategyPerformance([
        { id: 1, netPnl: 10, returnPercent: 10, closedAt: "2026-07-01T01:00:00Z" },
        { id: 2, netPnl: -5, returnPercent: -5, closedAt: "2026-07-01T02:00:00Z" },
        { id: 3, netPnl: -7, returnPercent: -7, closedAt: "2026-07-01T03:00:00Z" },
        { id: 4, netPnl: 3, returnPercent: 3, closedAt: "2026-07-01T04:00:00Z" },
      ]);

      assertClose(result.maxDrawdown, 12, "최대 낙폭 금액 오류");
      assert(result.maxDrawdownPercent > 11, "최대 낙폭 비율 오류");
      assert(result.consecutiveLossesMax === 2, "연속 손실 횟수 오류");
    },
  },
  {
    name: "중복 거래 ID를 거부한다",
    run: () => {
      let thrown = false;
      try {
        analyzeStrategyPerformance([
          { id: 1, netPnl: 1, returnPercent: 0.1, closedAt: "2026-07-01T01:00:00Z" },
          { id: 1, netPnl: 2, returnPercent: 0.2, closedAt: "2026-07-01T02:00:00Z" },
        ]);
      } catch {
        thrown = true;
      }
      assert(thrown, "중복 거래 ID가 허용됐습니다.");
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`[PASS] ${test.name}`);
}

console.log(`[DONE] Strategy Performance Analyzer ${tests.length}개 검증 통과`);
