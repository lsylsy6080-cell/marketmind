import assert from "node:assert/strict";
import { runDecisionEngineV2 } from "./DecisionEngineV2";
import type { DecisionV2Input } from "./types";
import type { MarketRegimeResult, TimeframeRegimeMetrics } from "../regime/types";

const now = new Date("2026-08-21T05:00:00.000Z");

function tf(timeframe: TimeframeRegimeMetrics["timeframe"], weight: number, rsi14: number, ret: number, direction: TimeframeRegimeMetrics["direction"]): TimeframeRegimeMetrics {
  return {
    timeframe, weight, observedAt: "2026-08-21T04:55:00.000Z", close: 75000,
    ema20: 74500, ema60: 73500, ema120: 72000, rsi14, adx14: 35,
    atrPercent: 0.5, bollingerWidth: 0.03, return20Percent: ret,
    directionScore: direction === "bullish" ? 80 : direction === "bearish" ? -80 : 0,
    direction, volatility: "normal",
  };
}

function regime(overheated = false): MarketRegimeResult {
  return {
    symbol: "BTCUSDT", calculatedAt: "2026-08-21T04:58:00.000Z", bucketTime: "2026-08-21T04:55:00.000Z",
    regime: "strong_bull_trend", directionBias: "bullish", confidence: 92, trendScore: 82,
    alignmentScore: 100, weightedAdx: 42, highVolatilityWeight: overheated ? 20 : 0, riskLevel: "low",
    timeframeDetails: [
      tf("1m", .1, overheated ? 70 : 58, overheated ? 1 : .2, "bullish"),
      tf("5m", .15, overheated ? 76 : 60, overheated ? 3 : .5, "bullish"),
      tf("15m", .2, overheated ? 82 : 62, overheated ? 6 : 1, "bullish"),
      tf("1h", .25, overheated ? 88 : 64, overheated ? 10 : 2, "bullish"),
      tf("4h", .2, overheated ? 92 : 65, overheated ? 16 : 3, "bullish"),
      tf("1d", .1, overheated ? 84 : 63, overheated ? 18 : 3, "bullish"),
    ],
    reasons: [], strategyVersion: "market-regime-v2.0",
  };
}

function baseInput(overheated = false): DecisionV2Input {
  return {
    technical: { score: 78, confidence: 80, observedAt: "2026-08-21T04:58:00.000Z", tradingPermission: "allowed" },
    news: { score: 60, confidence: 66, observedAt: "2026-08-21T04:30:00.000Z", conflictScore: 10 },
    funding: { score: 58, confidence: 70, observedAt: "2026-08-21T04:50:00.000Z", tradingPermission: "allowed" },
    regime: regime(overheated), now,
  };
}

const tests: Array<[string, () => void]> = [
  ["검증된 bullish News candidate는 최대 +6점 범위에서만 반영한다", () => {
    const input = baseInput(false);
    input.news.score = 51.2;
    input.news.limitedNewsCandidate = { status: "candidate_ready", bullishThreshold: 50.93, bearishThreshold: 48.88, mode: "bullish_only" };
    const result = runDecisionEngineV2(input);
    assert.ok(result.componentContributions.news > 0);
    assert.ok(result.componentContributions.news <= 6);
    assert.ok(result.reasons.some((x) => x.includes("News limited bullish candidate")));
  }],
  ["미검증 bearish News candidate는 Decision에 새로 적용하지 않는다", () => {
    const input = baseInput(false);
    input.news.score = 48;
    input.news.limitedNewsCandidate = { status: "candidate_ready", bullishThreshold: 50.93, bearishThreshold: 48.88, mode: "bullish_only" };
    const result = runDecisionEngineV2(input);
    assert.ok(!result.reasons.some((x) => x.includes("News limited bullish candidate")));
  }],
  ["Funding 상단 분포가 포화되면 crowding 감점을 적용하지 않는다", () => {
    const input = baseInput(false);
    input.funding.details = { funding_basis_points: 1 };
    input.funding.fundingCrowdingCandidate = {
      status: "candidate_ready", sampleCount: 1000, p10BasisPoints: 0.32, medianBasisPoints: 1,
      p90BasisPoints: 1, p90AbsoluteBasisPoints: 1, sourceAgeHours: 1,
    };
    const result = runDecisionEngineV2(input);
    assert.equal(result.fundingCrowdingStatus, "distribution_saturated");
    assert.equal(result.fundingEntryPenalty, 0);
    assert.equal(result.componentContributions.funding, 0);
  }],
  ["건강한 Funding 분포에서 LONG crowding은 bullish 진입 점수를 제한적으로 감점한다", () => {
    const input = baseInput(false);
    input.funding.details = { funding_basis_points: 3.2 };
    input.funding.fundingCrowdingCandidate = {
      status: "candidate_ready", sampleCount: 1000, p10BasisPoints: -0.8, medianBasisPoints: 0.4,
      p90BasisPoints: 2.0, p90AbsoluteBasisPoints: 2.4, sourceAgeHours: 1,
    };
    const withoutCrowding = runDecisionEngineV2({ ...input, funding: { ...input.funding, fundingCrowdingCandidate: undefined } });
    const result = runDecisionEngineV2(input);
    assert.equal(result.fundingCrowdingStatus, "active");
    assert.equal(result.fundingCrowdingSide, "long_crowded");
    assert.ok(result.fundingCrowdingRisk >= 60);
    assert.ok(result.fundingEntryPenalty > 0 && result.fundingEntryPenalty <= 12);
    assert.ok(result.entryQualityScore < withoutCrowding.entryQualityScore);
    assert.equal(result.componentContributions.funding, 0);
  }],
  ["LONG crowding은 bearish 방향 진입을 감점하지 않는다", () => {
    const input = baseInput(false);
    input.regime = { ...input.regime, regime: "strong_bear_trend", directionBias: "bearish", trendScore: -82, timeframeDetails: input.regime.timeframeDetails.map((x) => ({ ...x, direction: "bearish", directionScore: -80 })) };
    input.technical.score = 25;
    input.news.score = 45;
    input.funding.details = { funding_basis_points: 3.2 };
    input.funding.fundingCrowdingCandidate = { status: "candidate_ready", sampleCount: 1000, p10BasisPoints: -0.8, medianBasisPoints: 0.4, p90BasisPoints: 2.0, p90AbsoluteBasisPoints: 2.4, sourceAgeHours: 1 };
    const result = runDecisionEngineV2(input);
    assert.equal(result.fundingCrowdingSide, "long_crowded");
    assert.equal(result.fundingEntryPenalty, 0);
  }],
  ["강한 상승 추세와 양호한 진입 품질에서 매수 행동을 허용한다", () => {
    const result = runDecisionEngineV2(baseInput(false));
    assert.equal(result.direction, "bullish");
    assert.ok(["buy", "strong_buy"].includes(result.action));
    assert.ok(result.entryQualityScore >= 54);
    assert.ok(result.marketTrendStrength >= 60);
    assert.ok(result.directionStrength >= 40);
  }],
  ["강한 상승 추세라도 과열이면 추격 매수를 억제한다", () => {
    const result = runDecisionEngineV2(baseInput(true));
    assert.equal(result.direction, "bullish");
    assert.ok(result.overheatRisk >= 68);
    assert.equal(result.action, "wait");
    assert.equal(result.preferredEntry, "pullback");
  }],
  ["실제 강세장 프로필에서도 상위 시간봉 과열이면 BUY 대신 WAIT/PULLBACK을 선택한다", () => {
    const input = baseInput(false);
    input.regime = {
      ...regime(false),
      confidence: 98.02,
      trendScore: 90.09,
      alignmentScore: 100,
      weightedAdx: 47.07,
      highVolatilityWeight: 20,
      timeframeDetails: [
        tf("1m", .1, 58.41, .1363, "bullish"),
        tf("5m", .15, 61.79, .7337, "bullish"),
        tf("15m", .2, 66.31, 2.1937, "bullish"),
        tf("1h", .25, 76.44, 6.7238, "bullish"),
        tf("4h", .2, 92.2, 15.8619, "bullish"),
        tf("1d", .1, 80.32, 16.1196, "bullish"),
      ],
    };
    input.technical.score = 74.2;
    input.technical.confidence = 77;
    input.news.score = 52.6;
    input.funding.score = 48.2;

    const result = runDecisionEngineV2(input);
    assert.equal(result.direction, "bullish");
    assert.ok(result.overheatRisk >= 60);
    assert.equal(result.action, "wait");
    assert.equal(result.preferredEntry, "pullback");
    assert.ok(result.marketTrendStrength >= 80);
    assert.ok(result.directionStrength > result.entryQualityScore);
    assert.ok(result.entryQualityScore < 48);
  }],
  ["방향 강도와 진입 점수는 서로 독립된 축으로 계산된다", () => {
    const result = runDecisionEngineV2(baseInput(true));
    assert.equal(result.direction, "bullish");
    assert.ok(result.marketTrendStrength >= 70);
    assert.ok(result.directionStrength >= 45);
    assert.ok(result.entryQualityScore < result.directionStrength);
    assert.equal(result.action, "wait");
  }],

  ["bullish WAIT에서는 현재가 아래로 1차·2차 관심가와 무효화 가격을 순서대로 만든다", () => {
    const result = runDecisionEngineV2(baseInput(true));
    assert.equal(result.direction, "bullish");
    assert.equal(result.action, "wait");
    assert.equal(result.entryPlan.status, "active");
    assert.equal(result.entryPlan.side, "long");
    assert.ok(result.entryPlan.currentPrice != null);
    assert.ok(result.entryPlan.firstInterestPrice != null);
    assert.ok(result.entryPlan.secondInterestPrice != null);
    assert.ok(result.entryPlan.invalidationPrice != null);
    assert.ok(result.entryPlan.currentPrice! > result.entryPlan.firstInterestPrice!);
    assert.ok(result.entryPlan.firstInterestPrice! > result.entryPlan.secondInterestPrice!);
    assert.ok(result.entryPlan.secondInterestPrice! > result.entryPlan.invalidationPrice!);
    assert.ok(result.entryPlan.firstInterestEstimatedScore! >= result.entryQualityScore);
    assert.ok(result.entryPlan.secondInterestEstimatedScore! >= result.entryPlan.firstInterestEstimatedScore!);
  }],
  ["bearish 방향에서는 현재가 위로 반등 관심가를 만든다", () => {
    const input = baseInput(false);
    input.regime = {
      ...input.regime,
      regime: "strong_bear_trend",
      directionBias: "bearish",
      trendScore: -82,
      timeframeDetails: input.regime.timeframeDetails.map((x) => ({
        ...x,
        close: 75000,
        ema20: 75500,
        ema60: 76500,
        ema120: 78000,
        rsi14: 38,
        return20Percent: -2,
        direction: "bearish",
        directionScore: -80,
      })),
    };
    input.technical.score = 25;
    input.news.score = 45;
    const result = runDecisionEngineV2(input);
    assert.equal(result.direction, "bearish");
    assert.equal(result.entryPlan.side, "short");
    assert.ok(result.entryPlan.firstInterestPrice! > result.entryPlan.currentPrice!);
    assert.ok(result.entryPlan.secondInterestPrice! > result.entryPlan.firstInterestPrice!);
    assert.ok(result.entryPlan.invalidationPrice! > result.entryPlan.secondInterestPrice!);
  }],

  ["첫 실행은 새 Entry Plan을 만들고 WATCH 상태로 시작한다", () => {
    const result = runDecisionEngineV2(baseInput(true));
    assert.equal(result.entryTrigger.referencePlanSource, "current");
    assert.equal(result.entryTrigger.status, "WATCH");
    assert.equal(result.entryTrigger.zone, "before_first");
  }],
  ["이전 계획의 1차 관심가에 도달하고 모든 조건이 충족되면 READY가 된다", () => {
    const input = baseInput(false);
    input.technical.score = 95;
    input.technical.confidence = 90;
    input.news.direction = "bullish";
    input.regime = { ...input.regime, trendScore: 95, weightedAdx: 50 };
    input.previousEntryPlan = {
      status: "active", side: "long", currentPrice: 76000,
      firstInterestPrice: 75500, secondInterestPrice: 74500, invalidationPrice: 73500,
      currentEntryScore: 30, firstInterestEstimatedScore: 62, secondInterestEstimatedScore: 75,
      firstDistancePercent: 0.66, secondDistancePercent: 1.97, invalidationDistancePercent: 3.29,
      basis: [],
    };
    input.previousEntryPlanCalculatedAt = "2026-08-21T04:30:00.000Z";
    const result = runDecisionEngineV2(input);
    assert.equal(result.entryTrigger.referencePlanSource, "previous");
    assert.equal(result.entryTrigger.zone, "first_zone");
    assert.equal(result.entryTrigger.status, "READY");
    assert.equal(result.entryTrigger.blockers.length, 0);
  }],
  ["2차 관심가까지 왔지만 과열 조건이 남으면 RE_EVALUATE 한다", () => {
    const input = baseInput(true);
    input.previousEntryPlan = {
      status: "active", side: "long", currentPrice: 77000,
      firstInterestPrice: 76500, secondInterestPrice: 75500, invalidationPrice: 73500,
      currentEntryScore: 25, firstInterestEstimatedScore: 45, secondInterestEstimatedScore: 60,
      firstDistancePercent: 0.65, secondDistancePercent: 1.95, invalidationDistancePercent: 4.55,
      basis: [],
    };
    const result = runDecisionEngineV2(input);
    assert.equal(result.entryTrigger.zone, "second_zone");
    assert.equal(result.entryTrigger.status, "RE_EVALUATE");
    assert.ok(result.entryTrigger.blockers.some((x) => x.includes("과열")));
  }],
  ["기준 무효화 가격을 침범하면 INVALIDATED 처리한다", () => {
    const input = baseInput(false);
    input.previousEntryPlan = {
      status: "active", side: "long", currentPrice: 78000,
      firstInterestPrice: 77000, secondInterestPrice: 76000, invalidationPrice: 75200,
      currentEntryScore: 30, firstInterestEstimatedScore: 50, secondInterestEstimatedScore: 65,
      firstDistancePercent: 1.28, secondDistancePercent: 2.56, invalidationDistancePercent: 3.59,
      basis: [],
    };
    const result = runDecisionEngineV2(input);
    assert.equal(result.entryTrigger.zone, "invalidated");
    assert.equal(result.entryTrigger.status, "INVALIDATED");
  }],
  ["오래된 데이터는 신뢰도를 낮추고 거래를 차단한다", () => {
    const input = baseInput(false);
    input.technical.observedAt = "2026-08-20T00:00:00.000Z";
    input.news.observedAt = "2026-08-19T00:00:00.000Z";
    input.funding.observedAt = "2026-08-20T00:00:00.000Z";
    input.regime.calculatedAt = "2026-08-20T00:00:00.000Z";
    const result = runDecisionEngineV2(input);
    assert.ok(result.dataReliability < 35);
    assert.equal(result.tradingPermission, "blocked");
    assert.equal(result.action, "wait");
  }],
  ["Regime 가중치 합계는 1이다", () => {
    const result = runDecisionEngineV2(baseInput(false));
    const sum = result.weights.technical + result.weights.news + result.weights.funding + result.weights.regime;
    assert.ok(Math.abs(sum - 1) < 1e-9);
  }],
];

for (const [name, test] of tests) {
  try { test(); console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}`); throw error; }
}
