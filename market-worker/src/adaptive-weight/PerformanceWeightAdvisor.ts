import type {
  AdvisorWeights,
  ComponentEvidence,
  ComponentPerformanceSample,
  WeightAdvisorInput,
  WeightAdvisorResult,
  WeightComponent,
} from "./types";

const MAX_ADJUSTMENT = 0.05;
const PRIOR_SAMPLE_SIZE = 20;
const PRIOR_ACCURACY = 0.5;
const HALF_LIFE_DAYS = 30;
const MARKET_RETURN_THRESHOLD = 0.1;
const DEFAULT_MIN_ACTIVE_SIGNALS = 20;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 4): number => {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
};

function componentThresholds(component: Exclude<WeightComponent, "regime">): { bull: number; bear: number } {
  // 각 원본 엔진이 실제 방향을 판정하는 경계값을 그대로 사용한다.
  if (component === "technical") return { bull: 60, bear: 40 };
  return { bull: 57, bear: 43 };
}

function scoreDirection(
  score: number,
  component: Exclude<WeightComponent, "regime">,
): "bullish" | "neutral" | "bearish" {
  const threshold = componentThresholds(component);
  if (score >= threshold.bull) return "bullish";
  if (score <= threshold.bear) return "bearish";
  return "neutral";
}

function marketDirection(marketReturn: number): "bullish" | "neutral" | "bearish" {
  if (marketReturn > MARKET_RETURN_THRESHOLD) return "bullish";
  if (marketReturn < -MARKET_RETURN_THRESHOLD) return "bearish";
  return "neutral";
}

function recencyWeight(evaluatedAt: string, now: Date): number {
  const ts = new Date(evaluatedAt).getTime();
  if (!Number.isFinite(ts)) return 0;
  const ageDays = Math.max(0, (now.getTime() - ts) / 86_400_000);
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

function componentScore(
  sample: ComponentPerformanceSample,
  component: Exclude<WeightComponent, "regime">,
): number {
  if (component === "technical") return sample.technicalScore;
  if (component === "news") return sample.newsScore;
  return sample.fundingScore;
}

function weightedCorrelation(xs: number[], ys: number[], ws: number[]): number | null {
  const totalWeight = ws.reduce((sum, value) => sum + value, 0);
  if (xs.length < 3 || totalWeight <= 0) return null;

  const meanX = xs.reduce((sum, value, index) => sum + value * ws[index], 0) / totalWeight;
  const meanY = ys.reduce((sum, value, index) => sum + value * ws[index], 0) / totalWeight;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    covariance += ws[index] * dx * dy;
    varianceX += ws[index] * dx * dx;
    varianceY += ws[index] * dy * dy;
  }

  if (varianceX <= 1e-12 || varianceY <= 1e-12) return null;
  return clamp(covariance / Math.sqrt(varianceX * varianceY), -1, 1);
}

function buildEvidence(
  component: Exclude<WeightComponent, "regime">,
  samples: ComponentPerformanceSample[],
  now: Date,
  minimumSamples: number,
  minimumActiveSignals: number,
): ComponentEvidence {
  let activeSignalCount = 0;
  let neutralSignalCount = 0;
  let directionalEvaluationCount = 0;
  let correctWeight = 0;
  let directionalWeight = 0;
  let signedReturnWeight = 0;
  let signedReturnSum = 0;

  const correlationScores: number[] = [];
  const correlationReturns: number[] = [];
  const correlationWeights: number[] = [];

  for (const sample of samples) {
    const score = componentScore(sample, component);
    const direction = scoreDirection(score, component);
    const weight = recencyWeight(sample.evaluatedAt, now);
    if (weight <= 0) continue;

    // 중립은 "가격이 횡보할 것"이라는 적극적 예측으로 취급하지 않는다.
    // 방향성 정확도 계산에서 제외하고 신호 커버리지로 별도 측정한다.
    if (direction === "neutral") {
      neutralSignalCount += 1;
      continue;
    }

    activeSignalCount += 1;
    const actualDirection = marketDirection(sample.marketReturn);
    if (actualDirection !== "neutral") {
      directionalEvaluationCount += 1;
      directionalWeight += weight;
      if (direction === actualDirection) correctWeight += weight;
    }

    const sign = direction === "bullish" ? 1 : -1;
    signedReturnSum += sign * sample.marketReturn * weight;
    signedReturnWeight += weight;

    // 50 중심의 연속 점수와 실제 수익률의 관계도 함께 본다.
    correlationScores.push((score - 50) / 50);
    correlationReturns.push(sample.marketReturn);
    correlationWeights.push(weight);
  }

  const sampleCount = activeSignalCount + neutralSignalCount;
  const signalCoverage = sampleCount > 0 ? activeSignalCount / sampleCount : null;
  const weightedAccuracy = directionalWeight > 0 ? correctWeight / directionalWeight : null;
  const shrunkAccuracy = weightedAccuracy === null
    ? null
    : (weightedAccuracy * directionalWeight + PRIOR_ACCURACY * PRIOR_SAMPLE_SIZE) /
      (directionalWeight + PRIOR_SAMPLE_SIZE);
  const correlation = weightedCorrelation(correlationScores, correlationReturns, correlationWeights);
  const averageDirectionalReturn = signedReturnWeight > 0 ? signedReturnSum / signedReturnWeight : null;

  const enoughTotal = sampleCount >= minimumSamples;
  const enoughActive = activeSignalCount >= minimumActiveSignals;
  const enoughDirectional = directionalEvaluationCount >= Math.max(10, Math.floor(minimumActiveSignals * 0.6));

  // Reliability는 단일 적중률이 아니라 방향 적중 + 연속 상관 + 방향성 수익 + 표본/커버리지를 합친다.
  // 상관·수익률은 극단값이 지배하지 않도록 제한한다.
  const accuracyPart = shrunkAccuracy ?? 0.5;
  const correlationPart = correlation === null ? 0.5 : 0.5 + 0.5 * correlation;
  const returnPart = averageDirectionalReturn === null
    ? 0.5
    : 0.5 + 0.5 * clamp(averageDirectionalReturn / 1.0, -1, 1);
  const coveragePart = signalCoverage === null ? 0 : Math.min(1, signalCoverage / 0.35);
  const samplePart = Math.min(1, activeSignalCount / Math.max(minimumActiveSignals * 2, 1));

  const reliability = clamp(
    accuracyPart * 0.45 +
      correlationPart * 0.20 +
      returnPart * 0.20 +
      coveragePart * 0.075 +
      samplePart * 0.075,
    0,
    1,
  );
  const skillVsRandom = reliability - 0.5;
  const eligibleForReallocation = enoughTotal && enoughActive && enoughDirectional;
  const adjustment = eligibleForReallocation
    ? clamp(skillVsRandom * 0.35, -MAX_ADJUSTMENT, MAX_ADJUSTMENT)
    : 0;

  let note: string;
  if (sampleCount === 0) {
    note = "평가 가능한 표본이 없어 기본 가중치를 유지합니다.";
  } else if (!enoughTotal) {
    note = `전체 표본 ${minimumSamples}건 미만이라 관찰만 합니다.`;
  } else if (!enoughActive) {
    note = `실제 방향 신호 ${minimumActiveSignals}건 미만입니다. 중립 신호는 오답으로 처리하지 않고 커버리지만 기록합니다.`;
  } else if (!enoughDirectional) {
    note = "방향 신호 이후 의미 있는 가격 움직임 표본이 부족해 관찰만 합니다.";
  } else {
    note = "방향 신호 표본만 적중률에 사용하고, 수익 상관·방향성 수익·커버리지를 함께 Reliability로 평가했습니다.";
  }

  return {
    component,
    sampleCount,
    activeSignalCount,
    neutralSignalCount,
    directionalEvaluationCount,
    effectiveSampleSize: round(directionalWeight, 2),
    signalCoverage: signalCoverage === null ? null : round(signalCoverage, 4),
    weightedAccuracy: weightedAccuracy === null ? null : round(weightedAccuracy, 4),
    shrunkAccuracy: shrunkAccuracy === null ? null : round(shrunkAccuracy, 4),
    weightedCorrelation: correlation === null ? null : round(correlation, 4),
    averageDirectionalReturn: averageDirectionalReturn === null ? null : round(averageDirectionalReturn, 4),
    reliabilityScore: round(reliability, 4),
    skillVsRandom: round(skillVsRandom, 4),
    adjustment: round(adjustment, 4),
    eligibleForReallocation,
    note,
  };
}

function buildCandidateWeights(baseline: AdvisorWeights, evidence: ComponentEvidence[]): AdvisorWeights {
  const external = evidence.filter((item) => item.component !== "regime" && item.eligibleForReallocation);
  const positive = external.filter((item) => item.adjustment > 0);
  const negative = external.filter((item) => item.adjustment < 0);

  // 모두 좋거나 모두 나쁜 경우 정규화 때문에 "감점받은 항목이 오히려 증가"하는 것을 막는다.
  // 재배분은 상대적으로 좋은 항목과 나쁜 항목이 동시에 검증됐을 때만 수행한다.
  if (positive.length === 0 || negative.length === 0) return { ...baseline };

  const positiveTotal = positive.reduce((sum, item) => sum + item.adjustment, 0);
  const negativeTotal = negative.reduce((sum, item) => sum + Math.abs(item.adjustment), 0);
  const transfer = Math.min(positiveTotal, negativeTotal, MAX_ADJUSTMENT * 2);
  if (transfer <= 0) return { ...baseline };

  const delta: Record<"technical" | "news" | "funding", number> = {
    technical: 0,
    news: 0,
    funding: 0,
  };

  for (const item of positive) {
    const component = item.component as keyof typeof delta;
    delta[component] += transfer * (item.adjustment / positiveTotal);
  }
  for (const item of negative) {
    const component = item.component as keyof typeof delta;
    delta[component] -= transfer * (Math.abs(item.adjustment) / negativeTotal);
  }

  const result: AdvisorWeights = {
    technical: round(clamp(baseline.technical + delta.technical, 0.1, 0.5), 4),
    news: round(clamp(baseline.news + delta.news, 0.08, 0.4), 4),
    funding: round(clamp(baseline.funding + delta.funding, 0.08, 0.4), 4),
    regime: round(baseline.regime, 4),
  };

  // 반올림 오차만 가장 큰 양의 delta 항목에 보정한다. 의미 있는 정규화는 하지 않는다.
  const total = result.technical + result.news + result.funding + result.regime;
  const diff = round(1 - total, 4);
  if (Math.abs(diff) > 0 && positive.length > 0) {
    const target = positive.sort((a, b) => b.adjustment - a.adjustment)[0].component as keyof typeof delta;
    result[target] = round(result[target] + diff, 4);
  }
  return result;
}

export function runPerformanceWeightAdvisor(input: WeightAdvisorInput): WeightAdvisorResult {
  const now = input.now ?? new Date();
  const minimumSamples = input.minimumSamples ?? 30;
  const minimumActiveSignals = input.minimumActiveSignals ?? DEFAULT_MIN_ACTIVE_SIGNALS;

  const componentEvidence: ComponentEvidence[] = (["technical", "news", "funding"] as const).map(
    (component) => buildEvidence(component, input.samples, now, minimumSamples, minimumActiveSignals),
  );

  componentEvidence.push({
    component: "regime",
    sampleCount: 0,
    activeSignalCount: 0,
    neutralSignalCount: 0,
    directionalEvaluationCount: 0,
    effectiveSampleSize: 0,
    signalCoverage: null,
    weightedAccuracy: null,
    shrunkAccuracy: null,
    weightedCorrelation: null,
    averageDirectionalReturn: null,
    reliabilityScore: null,
    skillVsRandom: null,
    adjustment: 0,
    eligibleForReallocation: false,
    note: "V1 과거 판단에는 Regime snapshot 연결키가 없어 성과를 추정하지 않습니다.",
  });

  const validated = componentEvidence.filter(
    (item) => item.component !== "regime" && item.eligibleForReallocation,
  );
  const candidateWeights = buildCandidateWeights(input.baseline, componentEvidence);
  const regimePerformanceAvailable = false;

  let status: WeightAdvisorResult["status"];
  let statusReason: string;
  if (input.samples.length < minimumSamples || validated.length === 0) {
    status = "insufficient_data";
    statusReason = "검증 가능한 방향성 표본이 아직 부족합니다.";
  } else if (!regimePerformanceAvailable || validated.length < 2) {
    status = "observation_only";
    statusReason = !regimePerformanceAvailable
      ? "Regime 과거 성과 연결이 없어 자동 가중치 추천 적용을 보류합니다. 구성요소 Reliability는 관찰용입니다."
      : "검증된 구성요소가 2개 미만이라 재배분을 보류합니다.";
  } else {
    status = "advisory_ready";
    statusReason = "복수 구성요소와 Regime 성과가 검증되어 추천 가중치를 생성할 수 있습니다.";
  }

  // 7-3A.1은 검증 단계이므로 observation_only/insufficient_data에서는 실제 recommended를 baseline으로 고정한다.
  const recommendedWeights = status === "advisory_ready" ? candidateWeights : { ...input.baseline };

  return {
    symbol: "BTCUSDT",
    calculatedAt: now.toISOString(),
    regime: input.regime,
    baselineWeights: input.baseline,
    candidateWeights,
    recommendedWeights,
    evidence: componentEvidence,
    sampleCount: input.samples.length,
    status,
    statusReason,
    maxAdjustment: MAX_ADJUSTMENT,
    validationSummary: {
      activeComponents: componentEvidence.filter((item) => item.component !== "regime" && item.activeSignalCount > 0).length,
      validatedComponents: validated.length,
      regimePerformanceAvailable,
      autoApplySafe: status === "advisory_ready",
    },
    methodology: [
      "중립 구성요소 신호를 '가격 횡보 예측'으로 간주하지 않고 방향 적중률 계산에서 제외합니다.",
      "각 구성요소가 실제 bullish/bearish 방향을 낸 표본에서만 Direction Accuracy를 측정합니다.",
      "연속 점수와 24시간 수익률의 weighted correlation 및 방향성 평균 수익률을 함께 계산합니다.",
      "Direction Accuracy·Correlation·Directional Return·Signal Coverage·표본 수를 합쳐 Reliability Score를 계산합니다.",
      "30일 반감기 recency weighting과 Bayesian shrinkage를 유지합니다.",
      "양수/음수 조정이 동시에 검증된 경우에만 zero-sum 방식으로 가중치를 재배분해 감점 항목의 역설적 증가를 막습니다.",
      "Regime 과거 성과가 연결되기 전까지 status=observation_only이며 Decision V2에 자동 적용하지 않습니다.",
    ],
    strategyVersion: "weight-advisor-v2.3a1-evaluator-validation",
  };
}
