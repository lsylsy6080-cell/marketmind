import { evaluateOptimizationReadiness } from "./OptimizationReadinessEvaluator";
import type { OptimizationReadinessInput } from "./OptimizationReadinessEvaluator";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const collecting: OptimizationReadinessInput = {
  performance: { strategyCount: 4, readyCount: 0, provisionalCount: 0, maxTrades: 2 },
  candidates: { candidateCount: 3, eligibleCount: 0, maxSelectedTrades: 2 },
  validation: {
    candidateCount: 3,
    robustCount: 0,
    watchCount: 0,
    overfitCount: 0,
    insufficientCount: 3,
  },
  recommendation: {
    id: 1,
    status: "hold",
    selectedCandidateName: null,
    requiresManualApproval: true,
  },
};

const tests: ReadonlyArray<{ name: string; run: () => void }> = [
  {
    name: "표본 부족은 오류가 아닌 collecting으로 판정한다",
    run: () => {
      const result = evaluateOptimizationReadiness(collecting);
      assert(result.overallStatus === "collecting", "수집 상태 판정 오류");
      assert(result.progressPercent > 0, "구현 진행률이 0입니다.");
    },
  },
  {
    name: "검증 추천이 준비되면 수동 검토 대기 상태가 된다",
    run: () => {
      const result = evaluateOptimizationReadiness({
        ...collecting,
        performance: { ...collecting.performance, readyCount: 1, maxTrades: 55 },
        candidates: { ...collecting.candidates, eligibleCount: 2, maxSelectedTrades: 42 },
        validation: {
          ...collecting.validation,
          robustCount: 1,
          insufficientCount: 0,
        },
        recommendation: {
          id: 2,
          status: "recommended",
          selectedCandidateName: "균형형",
          requiresManualApproval: true,
        },
      });
      assert(result.overallStatus === "ready_for_review", "검토 준비 판정 오류");
      assert(result.progressPercent === 100, "완료 단계 진행률 오류");
    },
  },
  {
    name: "자동 적용은 어떤 상태에서도 허용하지 않는다",
    run: () => {
      const result = evaluateOptimizationReadiness(collecting);
      assert(!result.safeForAutomaticApplication, "자동 적용이 허용됐습니다.");
    },
  },
  {
    name: "수동 승인 잠금이 풀리면 attention으로 판정한다",
    run: () => {
      const result = evaluateOptimizationReadiness({
        ...collecting,
        recommendation: {
          ...collecting.recommendation,
          requiresManualApproval: false,
        },
      });
      assert(result.overallStatus === "attention", "안전 잠금 해제를 감지하지 못했습니다.");
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`[PASS] ${test.name}`);
}
console.log(`[DONE] Optimization Readiness Evaluator ${tests.length}개 검증 통과`);
