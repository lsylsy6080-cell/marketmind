import { strict as assert } from "node:assert";
import { runPerformanceWeightAdvisor } from "./PerformanceWeightAdvisor";
import type { ComponentPerformanceSample } from "./types";

const now = new Date("2026-08-21T05:00:00Z");
const baseline = { technical: 0.34, news: 0.16, funding: 0.14, regime: 0.36 };

function sample(i: number, technicalScore: number, newsScore: number, fundingScore: number, marketReturn: number): ComponentPerformanceSample {
  return {
    evaluatedAt: new Date(now.getTime() - i * 3_600_000).toISOString(),
    technicalScore, newsScore, fundingScore, marketReturn,
  };
}

const lowSamples = Array.from({ length: 10 }, (_, i) => sample(i, 80, 50, 50, 1));
const low = runPerformanceWeightAdvisor({ regime: "strong_bull_trend", baseline, samples: lowSamples, now });
assert.equal(low.status, "insufficient_data");
assert.deepEqual(low.recommendedWeights, baseline);
console.log("[PASS] 최소 표본 미만이면 기본 가중치를 유지한다");

// News/Funding 중립은 '24h 횡보 예측'으로 오답 처리하면 안 된다.
const mostlyNeutral = Array.from({ length: 60 }, (_, i) =>
  sample(i, 80, 50, 50, i % 2 === 0 ? 1 : -1),
);
const neutralResult = runPerformanceWeightAdvisor({ regime: "strong_bull_trend", baseline, samples: mostlyNeutral, now });
const newsNeutral = neutralResult.evidence.find((item) => item.component === "news");
assert.equal(newsNeutral?.activeSignalCount, 0);
assert.equal(newsNeutral?.weightedAccuracy, null);
assert.equal(newsNeutral?.adjustment, 0);
console.log("[PASS] 중립 News/Funding을 가격 횡보 예측 오답으로 벌점 주지 않는다");

// 방향 신호의 적중률과 방향성 수익률을 실제로 측정한다.
const directional = Array.from({ length: 80 }, (_, i) => {
  const positive = i < 60;
  return sample(i, 80, i % 2 === 0 ? 80 : 20, 20, positive ? 1 : -1);
});
const evaluated = runPerformanceWeightAdvisor({
  regime: "strong_bull_trend",
  baseline,
  samples: directional,
  now,
  minimumActiveSignals: 10,
});
const technical = evaluated.evidence.find((item) => item.component === "technical");
assert.ok((technical?.activeSignalCount ?? 0) >= 60);
assert.ok((technical?.weightedAccuracy ?? 0) > 0.5);
assert.ok((technical?.averageDirectionalReturn ?? 0) > 0);
assert.ok((technical?.reliabilityScore ?? 0) > 0.5);
console.log("[PASS] 방향 신호 적중률·방향성 수익·Reliability를 분리 계산한다");

// Regime 성과 연결 전에는 자동 적용하지 않는다.
assert.equal(evaluated.status, "observation_only");
assert.deepEqual(evaluated.recommendedWeights, baseline);
assert.equal(evaluated.validationSummary.regimePerformanceAvailable, false);
assert.equal(evaluated.validationSummary.autoApplySafe, false);
console.log("[PASS] Regime 성과가 없으면 observation_only로 자동 적용을 차단한다");

// 모든 구성요소가 약한 경우 정규화 때문에 감점 항목이 오르는 현상을 막는다.
const allWeak = Array.from({ length: 80 }, (_, i) =>
  sample(i, 80, 80, 80, -1),
);
const weak = runPerformanceWeightAdvisor({
  regime: "strong_bull_trend",
  baseline,
  samples: allWeak,
  now,
  minimumActiveSignals: 10,
});
assert.deepEqual(weak.candidateWeights, baseline);
console.log("[PASS] 모든 구성요소가 약하면 정규화로 특정 감점 항목을 역설적으로 올리지 않는다");

for (const item of evaluated.evidence) {
  assert.ok(item.adjustment <= 0.05 && item.adjustment >= -0.05);
}
console.log("[PASS] 구성요소별 후보 조정폭은 ±5%p 이내다");
