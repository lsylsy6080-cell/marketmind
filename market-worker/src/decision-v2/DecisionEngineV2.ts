import type { MarketRegime, TimeframeRegimeMetrics } from "../regime/types";
import type {
  DecisionV2Input,
  DecisionV2Result,
  DecisionV2Weights,
  EntryQuality,
  EntryTimingPlan,
  EntryTriggerValidation,
  PreferredEntry,
  V2Action,
  V2Direction,
  V2RiskLevel,
  V2TradingPermission,
} from "./types";

const clamp = (value: number, min = 0, max = 100): number => Math.min(Math.max(value, min), max);
const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) throw new Error(`Decision V2 점수가 유효하지 않습니다: ${score}`);
  return clamp(score);
}

function scoreToDirectional(score: number): number {
  return (normalizeScore(score) - 50) * 2;
}

function getWeights(regime: MarketRegime): DecisionV2Weights {
  switch (regime) {
    case "strong_bull_trend":
    case "strong_bear_trend":
      return {
        technical: 0.34,
        news: 0.16,
        funding: 0.14,
        regime: 0.36,
        reason: "강한 추세에서는 MTF Regime과 기술 신호 비중을 높였습니다.",
      };
    case "bull_trend":
    case "bear_trend":
      return {
        technical: 0.34,
        news: 0.19,
        funding: 0.16,
        regime: 0.31,
        reason: "추세장에서는 기술·Regime을 우선하고 외부 신호를 보조로 반영했습니다.",
      };
    case "range":
      return {
        technical: 0.27,
        news: 0.25,
        funding: 0.23,
        regime: 0.25,
        reason: "횡보장에서는 단일 추세 신호 의존도를 낮추고 뉴스·펀딩 비중을 높였습니다.",
      };
    case "high_volatility":
      return {
        technical: 0.24,
        news: 0.26,
        funding: 0.22,
        regime: 0.28,
        reason: "고변동 구간에서는 기술 추격을 줄이고 외부 위험 신호와 Regime을 강화했습니다.",
      };
    case "transition":
    default:
      return {
        technical: 0.29,
        news: 0.24,
        funding: 0.18,
        regime: 0.29,
        reason: "전환 구간에서는 구성요소를 분산해 방향 오판 위험을 낮췄습니다.",
      };
  }
}

function timeframeOverheat(item: TimeframeRegimeMetrics, bias: V2Direction): number {
  if (bias === "neutral") return 0;
  const rsiHeat = bias === "bullish"
    ? clamp((item.rsi14 - 65) * 4)
    : clamp((35 - item.rsi14) * 4);
  const returnHeat = bias === "bullish"
    ? clamp(Math.max(0, item.return20Percent) * 7)
    : clamp(Math.max(0, -item.return20Percent) * 7);
  return clamp(rsiHeat * 0.65 + returnHeat * 0.35);
}

function calculateOverheat(input: DecisionV2Input): number {
  const bias = input.regime.directionBias;
  if (bias === "neutral") return 0;
  const details = input.regime.timeframeDetails;
  const totalWeight = details.reduce((sum, item) => sum + item.weight, 0) || 1;

  const baseHeat = details.reduce(
    (sum, item) => sum + timeframeOverheat(item, bias) * (item.weight / totalWeight),
    0,
  );

  // Phase 7-2.1: 상위 시간봉 과열이 겹칠 때 단순 가중평균이 희석시키는 문제를 보정한다.
  // 방향 판단은 그대로 유지하되, 신규 진입 타이밍에는 1h/4h/1d 과열을 강하게 반영한다.
  const byTimeframe = new Map(details.map((item) => [item.timeframe, item]));
  const oneHour = byTimeframe.get("1h");
  const fourHour = byTimeframe.get("4h");
  const oneDay = byTimeframe.get("1d");

  const isBull = bias === "bullish";
  const rsiIsHot = (item: TimeframeRegimeMetrics | undefined, threshold: number): boolean =>
    Boolean(item && (isBull ? item.rsi14 >= threshold : item.rsi14 <= 100 - threshold));
  const returnIsExtended = (item: TimeframeRegimeMetrics | undefined, threshold: number): boolean =>
    Boolean(item && (isBull ? item.return20Percent >= threshold : item.return20Percent <= -threshold));

  let stackedHeat = 0;
  if (rsiIsHot(oneHour, 75)) stackedHeat += 8;
  if (rsiIsHot(fourHour, 80)) stackedHeat += 12;
  if (rsiIsHot(oneDay, 75)) stackedHeat += 8;
  if (returnIsExtended(fourHour, 10)) stackedHeat += 6;
  if (returnIsExtended(oneDay, 12)) stackedHeat += 6;

  return round(clamp(baseHeat + stackedHeat));
}

function calculateReversalRisk(input: DecisionV2Input, overheatRisk: number): number {
  const shortFrames = input.regime.timeframeDetails.filter((item) => ["1m", "5m", "15m"].includes(item.timeframe));
  const bias = input.regime.directionBias;
  const oppositeShortWeight = shortFrames.reduce((sum, item) => {
    const opposite =
      (bias === "bullish" && item.direction === "bearish") ||
      (bias === "bearish" && item.direction === "bullish");
    return sum + (opposite ? item.weight : 0);
  }, 0);
  const shortWeight = shortFrames.reduce((sum, item) => sum + item.weight, 0) || 1;
  const oppositeShortPercent = (oppositeShortWeight / shortWeight) * 100;
  const alignmentPenalty = 100 - input.regime.alignmentScore;
  return round(clamp(
    overheatRisk * 0.42 +
      input.regime.highVolatilityWeight * 0.28 +
      alignmentPenalty * 0.2 +
      oppositeShortPercent * 0.1,
  ));
}

function freshnessScore(observedAt: string, maxAgeMinutes: number, now: Date): number {
  const observed = new Date(observedAt).getTime();
  if (!Number.isFinite(observed)) return 0;
  const ageMinutes = Math.max(0, (now.getTime() - observed) / 60_000);
  return clamp(100 * (1 - ageMinutes / maxAgeMinutes));
}

function calculateDataReliability(input: DecisionV2Input, now: Date): number {
  const technicalFreshness = freshnessScore(input.technical.observedAt, 30, now);
  const newsFreshness = freshnessScore(input.news.observedAt, 720, now);
  const fundingFreshness = freshnessScore(input.funding.observedAt, 180, now);
  const regimeFreshness = freshnessScore(input.regime.calculatedAt, 30, now);

  return round(clamp(
    technicalFreshness * 0.3 +
      newsFreshness * 0.2 +
      fundingFreshness * 0.2 +
      regimeFreshness * 0.3,
  ));
}

function determineDirection(score: number): V2Direction {
  if (score >= 60) return "bullish";
  if (score <= 40) return "bearish";
  return "neutral";
}

function calculateMarketTrendStrength(input: DecisionV2Input): number {
  const trendMagnitude = Math.abs(clamp(input.regime.trendScore, -100, 100));
  const alignment = clamp(input.regime.alignmentScore);
  const adxStrength = clamp((input.regime.weightedAdx - 15) * 2.5);

  // 시장 자체의 추세 강도만 표현한다. 과열/진입 품질은 여기서 감점하지 않는다.
  return round(clamp(
    trendMagnitude * 0.6 +
      alignment * 0.25 +
      adxStrength * 0.15,
  ));
}

function calculateDirectionStrength(directionScore: number, marketTrendStrength: number): number {
  // 종합 신호 방향 확신도. signed directionScore와 시장 추세 강도를 분리해 사람이 읽기 쉽게 만든다.
  return round(clamp(Math.abs(directionScore) * 0.6 + marketTrendStrength * 0.4));
}

function determineEntryQuality(score: number): EntryQuality {
  if (score >= 78) return "excellent";
  if (score >= 62) return "good";
  if (score >= 48) return "fair";
  return "poor";
}

function determineRisk(input: DecisionV2Input, reversalRisk: number, reliability: number): V2RiskLevel {
  if (reliability < 35 || reversalRisk >= 82) return "critical";
  if (input.regime.riskLevel === "high" || reversalRisk >= 62) return "high";
  if (input.regime.riskLevel === "normal" || reversalRisk >= 38) return "normal";
  return "low";
}

function normalizePermission(value?: string): V2TradingPermission {
  return value === "blocked" ? "blocked" : value === "caution" ? "caution" : "allowed";
}

function determinePermission(input: DecisionV2Input, risk: V2RiskLevel, reliability: number): V2TradingPermission {
  const componentPermissions = [
    normalizePermission(input.technical.tradingPermission),
    normalizePermission(input.funding.tradingPermission),
  ];
  if (risk === "critical" || reliability < 35 || componentPermissions.includes("blocked")) return "blocked";
  if (risk === "high" || componentPermissions.includes("caution")) return "caution";
  return "allowed";
}

function determineAction(params: {
  direction: V2Direction;
  finalScore: number;
  confidence: number;
  entryQuality: number;
  overheat: number;
  permission: V2TradingPermission;
}): V2Action {
  if (params.permission === "blocked" || params.direction === "neutral") return "wait";

  // Phase 7-2.1 Overheat Guard:
  // 강한 방향성이 있더라도 방향성 과열이 높으면 신규 추격 진입을 차단한다.
  // bullish에서는 고점 추격 LONG, bearish에서는 저점 추격 SELL/REDUCE를 동일하게 억제한다.
  if (params.overheat >= 60) return "wait";
  if (params.overheat >= 45 && params.entryQuality < 62) return "wait";

  if (params.direction === "bullish") {
    if (
      params.permission === "allowed" &&
      params.finalScore >= 74 &&
      params.confidence >= 72 &&
      params.entryQuality >= 72 &&
      params.overheat < 62
    ) return "strong_buy";

    if (
      params.finalScore >= 60 &&
      params.confidence >= 56 &&
      params.entryQuality >= 54 &&
      params.overheat < 78
    ) return "buy";

    return "wait";
  }

  if (
    params.finalScore <= 30 &&
    params.confidence >= 70 &&
    params.entryQuality >= 62
  ) return "sell";

  if (
    params.finalScore <= 40 &&
    params.confidence >= 55 &&
    params.entryQuality >= 50
  ) return "reduce";

  return "wait";
}

function determinePreferredEntry(
  regime: MarketRegime,
  direction: V2Direction,
  entryQuality: number,
  overheat: number,
): PreferredEntry {
  if (direction === "neutral") return regime === "range" ? "mean_reversion" : "wait";
  if (overheat >= 50) return "pullback";
  if (overheat >= 40 && entryQuality < 62) return "pullback";
  if (entryQuality < 48) return "wait";
  if (regime === "transition" || regime === "high_volatility") return "breakout";
  if (regime === "range") return "mean_reversion";
  return "trend_continuation";
}


function calculateEntryTimingPlan(
  input: DecisionV2Input,
  direction: V2Direction,
  currentEntryScore: number,
  overheatRisk: number,
): EntryTimingPlan {
  const details = new Map(input.regime.timeframeDetails.map((item) => [item.timeframe, item]));
  const oneMin = details.get("1m");
  const fiveMin = details.get("5m");
  const fifteen = details.get("15m");
  const oneHour = details.get("1h");
  const fourHour = details.get("4h");

  const currentPrice =
    oneMin?.close ?? fiveMin?.close ?? fifteen?.close ?? oneHour?.close ?? null;

  if (!currentPrice || !Number.isFinite(currentPrice) || currentPrice <= 0 || direction === "neutral") {
    return {
      status: direction === "neutral" ? "wait" : "unavailable",
      side: "none",
      currentPrice: currentPrice ?? null,
      firstInterestPrice: null,
      secondInterestPrice: null,
      invalidationPrice: null,
      currentEntryScore,
      firstInterestEstimatedScore: null,
      secondInterestEstimatedScore: null,
      firstDistancePercent: null,
      secondDistancePercent: null,
      invalidationDistancePercent: null,
      basis: ["방향성 또는 유효 현재가가 없어 가격 진입 계획을 만들지 않았습니다."],
    };
  }

  const atr15 = Math.max(0.1, fifteen?.atrPercent ?? 0.5);
  const atr1h = Math.max(0.2, oneHour?.atrPercent ?? 0.9);
  const atr4h = Math.max(0.5, fourHour?.atrPercent ?? 1.5);

  // 과열이 높을수록 더 깊은 눌림/반등을 기다리고, ATR이 높을수록 가격 간격을 넓힌다.
  const heatExtra = clamp(overheatRisk - 45, 0, 55) * 0.006;
  const firstDistance = clamp(Math.max(0.35, atr15 * 0.85 + heatExtra), 0.35, 1.6);
  const secondDistance = clamp(
    Math.max(firstDistance + 0.55, atr15 * 1.65, atr1h * 1.05 + heatExtra),
    0.9,
    3.2,
  );
  const invalidDistance = clamp(
    Math.max(secondDistance + 0.9, atr1h * 1.8, atr4h * 1.05),
    1.8,
    5.5,
  );

  const side: EntryTimingPlan["side"] = direction === "bullish" ? "long" : "short";
  const sign = direction === "bullish" ? -1 : 1;

  const projectedFirst = currentPrice * (1 + sign * firstDistance / 100);
  const projectedSecond = currentPrice * (1 + sign * secondDistance / 100);
  const projectedInvalid = currentPrice * (1 + sign * invalidDistance / 100);

  // EMA 지지/저항을 참고하되 현재가 반대편에 있는 EMA 때문에 가격 순서가 뒤집히지 않게 한다.
  const emaCandidates = [fifteen?.ema20, fifteen?.ema60, oneHour?.ema20, oneHour?.ema60]
    .filter((value): value is number => Number.isFinite(value));
  const validEmaCandidates = emaCandidates.filter((ema) =>
    direction === "bullish" ? ema < currentPrice : ema > currentPrice
  );

  const nearestEma = validEmaCandidates.length
    ? validEmaCandidates.reduce((best, ema) =>
        Math.abs(ema - currentPrice) < Math.abs(best - currentPrice) ? ema : best
      )
    : null;

  let firstInterest = nearestEma != null
    ? projectedFirst * 0.65 + nearestEma * 0.35
    : projectedFirst;

  // 첫 관심가는 지나치게 얕거나 깊지 않도록 계산된 band 안에 제한한다.
  if (direction === "bullish") {
    firstInterest = clamp(
      firstInterest,
      currentPrice * (1 - 1.8 / 100),
      currentPrice * (1 - 0.25 / 100),
    );
  } else {
    firstInterest = clamp(
      firstInterest,
      currentPrice * (1 + 0.25 / 100),
      currentPrice * (1 + 1.8 / 100),
    );
  }

  let secondInterest = projectedSecond;
  if (direction === "bullish") {
    secondInterest = Math.min(secondInterest, firstInterest * 0.994);
  } else {
    secondInterest = Math.max(secondInterest, firstInterest * 1.006);
  }

  let invalidation = projectedInvalid;
  const structure = input.marketStructure;
  if (direction === "bullish") {
    invalidation = Math.min(invalidation, secondInterest * 0.992);
    const structuralSupports = [
      structure?.swingLow15m,
      structure?.swingLow1h,
      oneHour?.ema60,
      fourHour?.ema60,
    ].filter((value): value is number =>
      Number.isFinite(value) && value! < secondInterest && value! >= currentPrice * 0.945
    );
    if (structuralSupports.length > 0) {
      const nearestBrokenSupport = Math.max(...structuralSupports);
      invalidation = Math.min(invalidation, nearestBrokenSupport * 0.997);
    }
    invalidation = Math.max(invalidation, currentPrice * 0.945);
  } else {
    invalidation = Math.max(invalidation, secondInterest * 1.008);
    const structuralResistances = [
      structure?.swingHigh15m,
      structure?.swingHigh1h,
      oneHour?.ema60,
      fourHour?.ema60,
    ].filter((value): value is number =>
      Number.isFinite(value) && value! > secondInterest && value! <= currentPrice * 1.055
    );
    if (structuralResistances.length > 0) {
      const nearestBrokenResistance = Math.min(...structuralResistances);
      invalidation = Math.max(invalidation, nearestBrokenResistance * 1.003);
    }
    invalidation = Math.min(invalidation, currentPrice * 1.055);
  }

  const distancePct = (price: number): number =>
    round(Math.abs(price - currentPrice) / currentPrice * 100, 3);

  const firstPct = distancePct(firstInterest);
  const secondPct = distancePct(secondInterest);
  const invalidPct = distancePct(invalidation);

  // 가격대별 진입 점수는 "예상치"다. 가격이 눌렸다고 다른 지표가 그대로라는 보장은 없으므로 상한을 둔다.
  const firstEstimated = round(clamp(
    currentEntryScore + firstPct * 12 + Math.min(12, overheatRisk * 0.08),
    currentEntryScore,
    78,
  ));
  const secondEstimated = round(clamp(
    currentEntryScore + secondPct * 15 + Math.min(18, overheatRisk * 0.12),
    currentEntryScore,
    88,
  ));

  return {
    status: "active",
    side,
    currentPrice: round(currentPrice, 2),
    firstInterestPrice: round(firstInterest, 2),
    secondInterestPrice: round(secondInterest, 2),
    invalidationPrice: round(invalidation, 2),
    currentEntryScore,
    firstInterestEstimatedScore: firstEstimated,
    secondInterestEstimatedScore: secondEstimated,
    firstDistancePercent: firstPct,
    secondDistancePercent: secondPct,
    invalidationDistancePercent: invalidPct,
    basis: [
      `15m ATR ${round(atr15, 3)}% · 1h ATR ${round(atr1h, 3)}% · 4h ATR ${round(atr4h, 3)}%`,
      `과열 ${round(overheatRisk)}/100을 반영해 ${side === "long" ? "눌림" : "반등"} 대기 폭을 조정했습니다.`,
      nearestEma != null
        ? `가장 가까운 유효 EMA ${round(nearestEma, 2)}를 1차 관심가에 보조 반영했습니다.`
        : "유효한 반대편 EMA가 없어 ATR 기반 관심가를 사용했습니다.",
      input.marketStructure
        ? `최근 15m/1h swing 구조와 EMA60을 무효화 가격에 함께 반영했습니다.`
        : "최근 swing 구조가 없어 ATR/EMA 기준으로 무효화 가격을 계산했습니다.",
      "관심가 도달 시 실제 RSI·Regime·News를 다시 계산해야 하며 예상 진입점수는 확정 신호가 아닙니다.",
    ],
  };
}


function validateEntryTrigger(params: {
  input: DecisionV2Input;
  direction: V2Direction;
  entryPlan: EntryTimingPlan;
  entryQualityScore: number;
  overheatRisk: number;
  dataReliability: number;
  tradingPermission: V2TradingPermission;
  fundingCrowding: FundingCrowdingEvaluation;
  squeezeWarning: SqueezeDecisionEvaluation;
}): EntryTriggerValidation {
  const {
    input, direction, entryPlan, entryQualityScore, overheatRisk,
    dataReliability, tradingPermission, fundingCrowding, squeezeWarning,
  } = params;

  const previous = input.previousEntryPlan;
  const sameSide =
    previous?.status === "active" &&
    ((direction === "bullish" && previous.side === "long") ||
      (direction === "bearish" && previous.side === "short"));
  const reference = sameSide ? previous! : entryPlan;
  const source: EntryTriggerValidation["referencePlanSource"] = sameSide ? "previous" : "current";
  const currentPrice = entryPlan.currentPrice;

  if (
    direction === "neutral" ||
    currentPrice == null ||
    reference.firstInterestPrice == null ||
    reference.secondInterestPrice == null ||
    reference.invalidationPrice == null
  ) {
    return {
      status: "UNAVAILABLE", zone: "unavailable", referencePlanSource: source,
      referencePlanCalculatedAt: sameSide ? (input.previousEntryPlanCalculatedAt ?? null) : null,
      referencePlan: null,
      currentPrice, conditions: {
        priceZoneReached: false, entryScorePass: false, overheatPass: false,
        fifteenMinutePass: false, oneHourTrendPass: false, regimePass: false,
        newsSafe: false, fundingSafe: false, squeezeSafe: false,
        reliabilityPass: false, permissionPass: false,
      },
      passedConditions: 0, totalConditions: 11, readyThreshold: 11,
      blockers: ["유효한 방향성 Entry Plan이 없습니다."],
      reasons: ["Entry Trigger Validator를 실행할 수 있는 기준 계획이 없습니다."],
    };
  }

  const isLong = direction === "bullish";
  const invalidated = isLong
    ? currentPrice <= reference.invalidationPrice
    : currentPrice >= reference.invalidationPrice;
  const secondReached = isLong
    ? currentPrice <= reference.secondInterestPrice
    : currentPrice >= reference.secondInterestPrice;
  const firstReached = isLong
    ? currentPrice <= reference.firstInterestPrice
    : currentPrice >= reference.firstInterestPrice;

  const frames = new Map(input.regime.timeframeDetails.map((item) => [item.timeframe, item]));
  const tf15 = frames.get("15m");
  const tf1h = frames.get("1h");

  const conditions = {
    priceZoneReached: firstReached,
    entryScorePass: entryQualityScore >= 62,
    overheatPass: overheatRisk <= 55,
    fifteenMinutePass: Boolean(tf15 && (isLong ? tf15.direction !== "bearish" : tf15.direction !== "bullish")),
    oneHourTrendPass: Boolean(tf1h && (isLong ? tf1h.direction === "bullish" : tf1h.direction === "bearish")),
    regimePass: isLong
      ? input.regime.directionBias === "bullish" && input.regime.trendScore >= 20
      : input.regime.directionBias === "bearish" && input.regime.trendScore <= -20,
    newsSafe: isLong ? input.news.direction !== "bearish" : input.news.direction !== "bullish",
    fundingSafe: !(
      fundingCrowding.status === "active" &&
      ((isLong && fundingCrowding.side === "long_crowded") ||
        (!isLong && fundingCrowding.side === "short_crowded"))
    ),
    squeezeSafe: squeezeWarning.entrySafe,
    reliabilityPass: dataReliability >= 55,
    permissionPass: tradingPermission !== "blocked",
  };

  const labels: Array<[keyof typeof conditions, string]> = [
    ["priceZoneReached", "관심 가격대 미도달"],
    ["entryScorePass", `Entry Score ${round(entryQualityScore)}/100 < 62`],
    ["overheatPass", `과열 ${round(overheatRisk)}/100 > 55`],
    ["fifteenMinutePass", "15m 방향이 진입 방향과 충돌"],
    ["oneHourTrendPass", "1h 추세가 진입 방향을 지지하지 않음"],
    ["regimePass", "Regime 방향/추세 조건 미충족"],
    ["newsSafe", "News 방향이 진입 방향과 충돌"],
    ["fundingSafe", "Funding crowding이 진입 방향과 충돌"],
    ["squeezeSafe", "Squeeze Early Warning이 신규 진입을 허용하지 않음"],
    ["reliabilityPass", `데이터 신뢰도 ${round(dataReliability)}/100 < 55`],
    ["permissionPass", "거래 권한 blocked"],
  ];

  const blockers = labels.filter(([key]) => !conditions[key]).map(([, label]) => label);
  const passedConditions = Object.values(conditions).filter(Boolean).length;

  let zone: EntryTriggerValidation["zone"] = "before_first";
  if (invalidated) zone = "invalidated";
  else if (secondReached) zone = "second_zone";
  else if (firstReached) zone = "first_zone";

  let status: EntryTriggerValidation["status"] = "WATCH";
  if (invalidated) status = "INVALIDATED";
  else if (firstReached && blockers.length === 0) status = "READY";
  else if (secondReached) status = "RE_EVALUATE";

  const reasons = [
    `기준 계획=${source} · 현재 ${round(currentPrice, 2)} · 1차 ${round(reference.firstInterestPrice, 2)} · 2차 ${round(reference.secondInterestPrice, 2)} · 무효화 ${round(reference.invalidationPrice, 2)}`,
    `조건 ${passedConditions}/11 충족 · 상태 ${status}`,
  ];
  if (status === "READY") reasons.push("가격과 안전 조건이 모두 충족되어 진입 준비 상태입니다. 실제 주문은 별도 실행 계층에서 결정해야 합니다.");
  if (status === "RE_EVALUATE") reasons.push("2차 관심 구간에 도달했지만 일부 조건이 부족해 재평가가 필요합니다.");
  if (status === "INVALIDATED") reasons.push("기준 무효화 가격을 침범해 기존 진입 계획을 폐기해야 합니다.");

  return {
    status, zone, referencePlanSource: source,
    referencePlanCalculatedAt: sameSide ? (input.previousEntryPlanCalculatedAt ?? null) : null,
    referencePlan: reference,
    currentPrice, conditions, passedConditions, totalConditions: 11, readyThreshold: 11,
    blockers, reasons,
  };
}

function buildInvalidationConditions(input: DecisionV2Input, direction: V2Direction): string[] {
  if (direction === "bullish") {
    return [
      "15m·1h MTF 방향이 동시에 bearish로 전환되면 bullish 가설을 재평가합니다.",
      "Regime trendScore가 +20 아래로 하락하면 추세 우위를 무효화합니다.",
      "Regime risk가 high이면서 alignment가 45% 미만이면 신규 LONG을 차단합니다.",
    ];
  }
  if (direction === "bearish") {
    return [
      "15m·1h MTF 방향이 동시에 bullish로 전환되면 bearish 가설을 재평가합니다.",
      "Regime trendScore가 -20 위로 회복되면 하락 추세 우위를 무효화합니다.",
      "Regime risk가 high이면서 alignment가 45% 미만이면 신규 SHORT 성격의 행동을 차단합니다.",
    ];
  }
  return [
    "Regime trendScore 절대값이 25 이상이고 MTF alignment가 65% 이상이 될 때 방향성 판단을 재개합니다.",
  ];
}


type FundingCrowdingEvaluation = {
  risk: number;
  side: "long_crowded" | "balanced" | "short_crowded" | "unavailable";
  entryPenalty: number;
  status: "active" | "inactive" | "distribution_saturated" | "insufficient_data" | "stale";
  reason: string;
};

function asFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function evaluateFundingCrowding(input: DecisionV2Input, direction: V2Direction): FundingCrowdingEvaluation {
  const candidate = input.funding.fundingCrowdingCandidate;
  if (!candidate) {
    return { risk: 0, side: "unavailable", entryPenalty: 0, status: "inactive", reason: "Funding crowding calibration snapshot이 없어 진입 보정을 적용하지 않았습니다." };
  }
  if (candidate.sourceAgeHours > 24) {
    return { risk: 0, side: "unavailable", entryPenalty: 0, status: "stale", reason: `Funding crowding calibration이 ${round(candidate.sourceAgeHours, 1)}시간 경과해 진입 보정을 적용하지 않았습니다.` };
  }
  if (candidate.status !== "candidate_ready" || candidate.sampleCount < 200) {
    return { risk: 0, side: "unavailable", entryPenalty: 0, status: "insufficient_data", reason: `Funding crowding 표본이 부족하거나 candidate_ready 상태가 아닙니다. sample=${candidate.sampleCount}` };
  }

  const p10 = candidate.p10BasisPoints;
  const median = candidate.medianBasisPoints;
  const p90 = candidate.p90BasisPoints;
  const p90Abs = candidate.p90AbsoluteBasisPoints;
  if (p10 == null || median == null || p90 == null || p90Abs == null) {
    return { risk: 0, side: "unavailable", entryPenalty: 0, status: "insufficient_data", reason: "Funding crowding percentile 값이 부족합니다." };
  }

  // Phase 7-3C guard: 중앙값과 상단 P90이 사실상 같은 값이면 상단 percentile이 포화된 것으로 본다.
  // 이전 shadow validation에서 1bp 반복 비율이 높았던 상황을 Decision에 직접 반영하지 않기 위한 안전장치다.
  if (Math.abs(p90 - median) < 0.05 || Math.abs(p90 - p10) < 0.25) {
    return {
      risk: 0, side: "unavailable", entryPenalty: 0, status: "distribution_saturated",
      reason: `Funding 분포 포화 감지(P10/Median/P90=${round(p10, 4)}/${round(median, 4)}/${round(p90, 4)}bp)로 crowding 감점을 적용하지 않았습니다.`,
    };
  }

  const details = input.funding.details ?? {};
  const currentBp = asFiniteNumber((details as Record<string, unknown>).funding_basis_points);
  if (currentBp == null) {
    return { risk: 0, side: "unavailable", entryPenalty: 0, status: "inactive", reason: "현재 Funding basis points를 확인하지 못해 crowding 감점을 적용하지 않았습니다." };
  }

  let side: FundingCrowdingEvaluation["side"] = "balanced";
  let risk = 0;
  if (currentBp >= p90 && p90 > 0) {
    side = "long_crowded";
    const scale = Math.max(0.1, p90Abs - median);
    risk = clamp(60 + ((currentBp - p90) / scale) * 25, 60, 100);
  } else if (currentBp <= p10 && p10 < 0) {
    side = "short_crowded";
    const scale = Math.max(0.1, Math.abs(p10));
    risk = clamp(60 + ((Math.abs(currentBp) - Math.abs(p10)) / scale) * 25, 60, 100);
  } else {
    const distanceFromMedian = Math.abs(currentBp - median);
    const halfRange = Math.max(0.1, (p90 - p10) / 2);
    risk = clamp((distanceFromMedian / halfRange) * 35, 0, 45);
  }

  const conflictsWithEntry =
    (direction === "bullish" && side === "long_crowded") ||
    (direction === "bearish" && side === "short_crowded");
  const entryPenalty = conflictsWithEntry ? round(clamp((risk - 50) * 0.24, 0, 12)) : 0;
  return {
    risk: round(risk),
    side,
    entryPenalty,
    status: side === "balanced" ? "inactive" : "active",
    reason: side === "balanced"
      ? `Funding ${round(currentBp, 4)}bp는 crowding 극단 구간이 아니어서 진입 감점이 없습니다.`
      : `Funding ${side} · risk ${round(risk)}/100${entryPenalty > 0 ? ` · ${direction} 진입점수 -${entryPenalty}` : " · 현재 방향과 충돌하지 않아 진입 감점 없음"}.`,
  };
}

function limitedNewsContribution(input: DecisionV2Input, legacyContribution: number): { contribution: number; applied: boolean; reason: string | null } {
  const candidate = input.news.limitedNewsCandidate;
  if (!candidate || candidate.status !== "candidate_ready" || candidate.mode !== "bullish_only" || candidate.bullishThreshold == null) {
    return { contribution: legacyContribution, applied: false, reason: null };
  }
  // Phase 7-3B: shadow validation에서 bullish만 검증되었으므로 bearish candidate는 아직 적용하지 않는다.
  if (input.news.score < candidate.bullishThreshold) return { contribution: legacyContribution, applied: false, reason: null };
  // Candidate bullish가 켜져도 Decision 전체를 지배하지 않도록 방향 기여를 최대 +6점으로 제한한다.
  // 기존 contribution보다 약하게 만들지는 않는다.
  const distance = Math.max(0, input.news.score - candidate.bullishThreshold);
  const candidateBoost = clamp(2.5 + distance * 1.5, 2.5, 6);
  return {
    contribution: Math.max(legacyContribution, candidateBoost),
    applied: true,
    reason: `News limited bullish candidate 적용: score ${round(input.news.score)} ≥ ${round(candidate.bullishThreshold)} · contribution +${round(Math.max(legacyContribution, candidateBoost))} (cap +6)`,
  };
}


type OpenInterestEvaluation = {
  status: "active" | "inactive" | "stale" | "insufficient_data";
  flowState: import("./types").OpenInterestDecisionContext["flowState"];
  directionalBias: import("./types").OpenInterestDecisionContext["directionalBias"];
  confidence: number;
  entryAdjustment: number;
  overheatAdjustment: number;
  reversalAdjustment: number;
  reason: string;
};

function evaluateOpenInterest(
  input: DecisionV2Input,
  direction: V2Direction,
  now: Date,
): OpenInterestEvaluation {
  const oi = input.openInterest;
  if (!oi) {
    return {
      status: "inactive", flowState: "insufficient_data", directionalBias: "neutral",
      confidence: 0, entryAdjustment: 0, overheatAdjustment: 0, reversalAdjustment: 0,
      reason: "OI snapshot이 없어 Decision 보정을 적용하지 않았습니다.",
    };
  }

  const ageMinutes = (now.getTime() - new Date(oi.observedAt).getTime()) / 60_000;
  if (!Number.isFinite(ageMinutes) || ageMinutes > 10) {
    return {
      status: "stale", flowState: oi.flowState, directionalBias: oi.directionalBias,
      confidence: oi.confidence, entryAdjustment: 0, overheatAdjustment: 0, reversalAdjustment: 0,
      reason: `OI snapshot이 ${round(ageMinutes, 1)}분 경과해 보정을 적용하지 않았습니다.`,
    };
  }

  if (oi.flowState === "insufficient_data" || oi.confidence < 30) {
    return {
      status: "insufficient_data", flowState: oi.flowState, directionalBias: oi.directionalBias,
      confidence: oi.confidence, entryAdjustment: 0, overheatAdjustment: 0, reversalAdjustment: 0,
      reason: `OI 표본/신뢰도가 부족해 보정을 적용하지 않았습니다. confidence=${round(oi.confidence)}`,
    };
  }

  let entryAdjustment = oi.entryAdjustment;
  if (
    direction !== "neutral" &&
    oi.directionalBias !== "neutral" &&
    direction !== oi.directionalBias
  ) {
    entryAdjustment = -Math.max(4, Math.abs(oi.entryAdjustment) * 1.5);
  }

  const confidenceScale = clamp(oi.confidence, 30, 100) / 100;
  entryAdjustment = round(entryAdjustment * confidenceScale, 2);
  const overheatAdjustment = round(Math.max(0, oi.overheatAdjustment) * confidenceScale, 2);
  const reversalAdjustment = round(oi.reversalAdjustment * confidenceScale, 2);

  return {
    status: "active",
    flowState: oi.flowState,
    directionalBias: oi.directionalBias,
    confidence: oi.confidence,
    entryAdjustment,
    overheatAdjustment,
    reversalAdjustment,
    reason:
      `OI ${oi.flowState} · bias=${oi.directionalBias} · confidence=${round(oi.confidence)} · ` +
      `Entry ${entryAdjustment >= 0 ? "+" : ""}${entryAdjustment} · Heat +${overheatAdjustment} · Reversal ${reversalAdjustment >= 0 ? "+" : ""}${reversalAdjustment}`,
  };
}


type LiquidationEvaluation = {
  status: "active" | "inactive" | "stale" | "insufficient_data";
  state: import("./types").LiquidationDecisionContext["state"];
  directionalBias: import("./types").LiquidationDecisionContext["directionalBias"];
  confidence: number;
  entryAdjustment: number;
  overheatAdjustment: number;
  reversalAdjustment: number;
  reason: string;
};

function evaluateLiquidation(
  input: DecisionV2Input,
  direction: V2Direction,
  now: Date,
): LiquidationEvaluation {
  const liq = input.liquidation;
  if (!liq) {
    return {
      status: "inactive", state: "insufficient_data", directionalBias: "neutral",
      confidence: 0, entryAdjustment: 0, overheatAdjustment: 0, reversalAdjustment: 0,
      reason: "Liquidation snapshot이 없어 Decision 보정을 적용하지 않았습니다.",
    };
  }

  const ageMinutes = (now.getTime() - new Date(liq.observedAt).getTime()) / 60_000;
  if (!Number.isFinite(ageMinutes) || ageMinutes > 5) {
    return {
      status: "stale", state: liq.state, directionalBias: liq.directionalBias,
      confidence: liq.confidence, entryAdjustment: 0, overheatAdjustment: 0, reversalAdjustment: 0,
      reason: `Liquidation snapshot이 ${round(ageMinutes, 1)}분 경과해 보정을 적용하지 않았습니다.`,
    };
  }

  if (!liq.streamHealthy || liq.state === "insufficient_data" || liq.confidence < 30) {
    return {
      status: "insufficient_data", state: liq.state, directionalBias: liq.directionalBias,
      confidence: liq.confidence, entryAdjustment: 0, overheatAdjustment: 0, reversalAdjustment: 0,
      reason: "Liquidation 스트림/표본 신뢰도가 부족해 보정을 적용하지 않았습니다.",
    };
  }

  let entryAdjustment = liq.entryAdjustment;
  if (
    direction !== "neutral" &&
    liq.directionalBias !== "neutral" &&
    direction !== liq.directionalBias
  ) {
    entryAdjustment = -Math.max(4, Math.abs(liq.entryAdjustment));
  }

  const scale = clamp(liq.confidence, 30, 100) / 100;
  return {
    status: "active",
    state: liq.state,
    directionalBias: liq.directionalBias,
    confidence: liq.confidence,
    entryAdjustment: round(entryAdjustment * scale, 2),
    overheatAdjustment: round(Math.max(0, liq.overheatAdjustment) * scale, 2),
    reversalAdjustment: round(Math.max(0, liq.reversalAdjustment) * scale, 2),
    reason:
      `Liquidation ${liq.state} · bias=${liq.directionalBias} · confidence=${round(liq.confidence)} · ` +
      `long=$${Math.round(liq.longLiquidationUsd).toLocaleString()} · short=$${Math.round(liq.shortLiquidationUsd).toLocaleString()}`,
  };
}


type SqueezeDecisionEvaluation = {
  status: "active" | "inactive" | "stale";
  longPhase: import("./types").SqueezeWarningDecisionContext["longPhase"];
  shortPhase: import("./types").SqueezeWarningDecisionContext["shortPhase"];
  dominantWarning: import("./types").SqueezeWarningDecisionContext["dominantWarning"];
  entryPenalty: number;
  overheatAdjustment: number;
  reversalAdjustment: number;
  permissionOverride: V2TradingPermission | null;
  entrySafe: boolean;
  recommendedResponse: string;
  reason: string;
};

function squeezePhaseSeverity(
  phase: import("./types").SqueezeWarningDecisionContext["longPhase"],
): number {
  switch (phase) {
    case "ACTIVE": return 4;
    case "IMMINENT": return 3;
    case "BUILDING": return 2;
    case "EXHAUSTION": return 1;
    case "WATCH":
    default: return 0;
  }
}

function evaluateSqueezeWarning(
  input: DecisionV2Input,
  direction: V2Direction,
  now: Date,
): SqueezeDecisionEvaluation {
  const warning = input.squeezeWarning;
  const inactive: SqueezeDecisionEvaluation = {
    status: "inactive",
    longPhase: "WATCH",
    shortPhase: "WATCH",
    dominantWarning: "balanced",
    entryPenalty: 0,
    overheatAdjustment: 0,
    reversalAdjustment: 0,
    permissionOverride: null,
    entrySafe: true,
    recommendedResponse: "observe",
    reason: "Squeeze Early Warning snapshot이 없어 Decision 보정을 적용하지 않았습니다.",
  };

  if (!warning) return inactive;

  const ageMinutes =
    (now.getTime() - new Date(warning.observedAt).getTime()) / 60_000;

  if (!Number.isFinite(ageMinutes) || ageMinutes > 5) {
    return {
      ...inactive,
      status: "stale",
      longPhase: warning.longPhase,
      shortPhase: warning.shortPhase,
      dominantWarning: warning.dominantWarning,
      reason: `Squeeze Early Warning이 ${round(ageMinutes, 1)}분 경과해 보정을 적용하지 않았습니다.`,
    };
  }

  if (direction === "neutral") {
    return {
      ...inactive,
      status: "active",
      longPhase: warning.longPhase,
      shortPhase: warning.shortPhase,
      dominantWarning: warning.dominantWarning,
      recommendedResponse:
        warning.dominantWarning === "long_squeeze"
          ? warning.longRecommendedResponse
          : warning.dominantWarning === "short_squeeze"
            ? warning.shortRecommendedResponse
            : "observe",
      reason:
        `Squeeze Warning LONG=${warning.longPhase}(${round(warning.longAlertScore)}) · ` +
        `SHORT=${warning.shortPhase}(${round(warning.shortAlertScore)}) · 현재 방향 neutral이라 진입 보정은 적용하지 않았습니다.`,
    };
  }

  // A LONG position is directly endangered by long_squeeze.
  // A SHORT position is directly endangered by short_squeeze.
  const adversePhase = direction === "bullish" ? warning.longPhase : warning.shortPhase;
  const chasePhase = direction === "bullish" ? warning.shortPhase : warning.longPhase;
  const adverseAlert = direction === "bullish" ? warning.longAlertScore : warning.shortAlertScore;
  const chaseAlert = direction === "bullish" ? warning.shortAlertScore : warning.longAlertScore;
  const adverseResponse =
    direction === "bullish" ? warning.longRecommendedResponse : warning.shortRecommendedResponse;
  const chaseResponse =
    direction === "bullish" ? warning.shortRecommendedResponse : warning.longRecommendedResponse;

  const adverseSeverity = squeezePhaseSeverity(adversePhase);
  const chaseSeverity = squeezePhaseSeverity(chasePhase);

  const adverseBasePenalty = [0, 3, 6, 14, 24][adverseSeverity] ?? 0;
  const chaseBasePenalty = [0, 3, 4, 8, 12][chaseSeverity] ?? 0;
  const adverseScale = 0.5 + clamp(adverseAlert) / 200;
  const chaseScale = 0.5 + clamp(chaseAlert) / 200;

  const entryPenalty = round(
    adverseBasePenalty * adverseScale + chaseBasePenalty * chaseScale,
    2,
  );

  const adverseOverheat = [0, 3, 4, 8, 12][adverseSeverity] ?? 0;
  const chaseOverheat = [0, 4, 5, 10, 16][chaseSeverity] ?? 0;
  const overheatAdjustment = round(
    adverseOverheat * adverseScale + chaseOverheat * chaseScale,
    2,
  );

  const adverseReversal = [0, 4, 6, 13, 20][adverseSeverity] ?? 0;
  const chaseReversal = [0, 3, 2, 5, 8][chaseSeverity] ?? 0;
  const reversalAdjustment = round(
    adverseReversal * adverseScale + chaseReversal * chaseScale,
    2,
  );

  let permissionOverride: V2TradingPermission | null = null;
  if (adversePhase === "ACTIVE") permissionOverride = "blocked";
  else if (
    adversePhase === "IMMINENT" ||
    adversePhase === "BUILDING" ||
    chasePhase === "ACTIVE" ||
    chasePhase === "IMMINENT"
  ) permissionOverride = "caution";

  const entrySafe =
    adversePhase !== "ACTIVE" &&
    adversePhase !== "IMMINENT" &&
    chasePhase !== "ACTIVE";

  const recommendedResponse =
    adverseSeverity >= chaseSeverity ? adverseResponse : chaseResponse;

  return {
    status: "active",
    longPhase: warning.longPhase,
    shortPhase: warning.shortPhase,
    dominantWarning: warning.dominantWarning,
    entryPenalty,
    overheatAdjustment,
    reversalAdjustment,
    permissionOverride,
    entrySafe,
    recommendedResponse,
    reason:
      `Squeeze Warning LONG=${warning.longPhase}(${round(warning.longAlertScore)}) · ` +
      `SHORT=${warning.shortPhase}(${round(warning.shortAlertScore)}) · ` +
      `Entry -${entryPenalty} · Heat +${overheatAdjustment} · Reversal +${reversalAdjustment}` +
      `${permissionOverride ? ` · permission=${permissionOverride}` : ""}`,
  };
}

function mergeTradingPermission(
  base: V2TradingPermission,
  override: V2TradingPermission | null,
): V2TradingPermission {
  if (base === "blocked" || override === "blocked") return "blocked";
  if (base === "caution" || override === "caution") return "caution";
  return "allowed";
}

export function runDecisionEngineV2(input: DecisionV2Input): DecisionV2Result {
  const now = input.now ?? new Date();
  const weights = getWeights(input.regime.regime);

  const regimeDirectional = clamp(input.regime.trendScore, -100, 100);
  const legacyNewsContribution = scoreToDirectional(input.news.score) * weights.news;
  const newsLimited = limitedNewsContribution(input, legacyNewsContribution);
  const contributions = {
    technical: scoreToDirectional(input.technical.score) * weights.technical,
    news: newsLimited.contribution,
    funding: 0,
    regime: regimeDirectional * weights.regime,
  };

  const directionScore = round(
    contributions.technical + contributions.news + contributions.funding + contributions.regime,
  );
  const finalScore = round(clamp(50 + directionScore / 2));
  const direction = determineDirection(finalScore);
  const marketTrendStrength = calculateMarketTrendStrength(input);
  const directionStrength = calculateDirectionStrength(directionScore, marketTrendStrength);
  const baseOverheatRisk = calculateOverheat(input);
  const baseReversalRisk = calculateReversalRisk(input, baseOverheatRisk);
  const dataReliability = calculateDataReliability(input, now);
  const fundingCrowding = evaluateFundingCrowding(input, direction);
  const openInterest = evaluateOpenInterest(input, direction, now);
  const liquidation = evaluateLiquidation(input, direction, now);
  const squeezeWarning = evaluateSqueezeWarning(input, direction, now);
  const overheatRisk = round(clamp(
    baseOverheatRisk +
    openInterest.overheatAdjustment +
    liquidation.overheatAdjustment +
    squeezeWarning.overheatAdjustment
  ));
  const reversalRisk = round(clamp(
    baseReversalRisk +
    openInterest.reversalAdjustment +
    liquidation.reversalAdjustment +
    squeezeWarning.reversalAdjustment
  ));

  const weightedConfidence =
    normalizeScore(input.technical.confidence) * weights.technical +
    normalizeScore(input.news.confidence) * weights.news +
    normalizeScore(input.funding.confidence) * weights.funding +
    normalizeScore(input.regime.confidence) * weights.regime;
  const conflictPenalty = clamp(input.news.conflictScore ?? 0) * 0.12;
  const confidence = round(clamp(
    weightedConfidence * 0.78 +
      input.regime.alignmentScore * 0.12 +
      dataReliability * 0.1 -
      conflictPenalty,
  ));

  const conviction = Math.abs(directionScore);
  const riskPenalty = input.regime.riskLevel === "high" ? 18 : input.regime.riskLevel === "normal" ? 8 : 0;
  const entryQualityScore = round(clamp(
    48 +
      conviction * 0.24 +
      input.regime.alignmentScore * 0.18 +
      dataReliability * 0.08 -
      overheatRisk * 0.55 -
      reversalRisk * 0.22 -
      riskPenalty -
      fundingCrowding.entryPenalty +
      openInterest.entryAdjustment +
      liquidation.entryAdjustment -
      squeezeWarning.entryPenalty,
  ));
  const entryQuality = determineEntryQuality(entryQualityScore);
  const riskLevel = determineRisk(input, reversalRisk, dataReliability);
  const baseTradingPermission = determinePermission(input, riskLevel, dataReliability);
  const fundingAdjustedPermission: V2TradingPermission =
    fundingCrowding.entryPenalty >= 8 && baseTradingPermission === "allowed"
      ? "caution"
      : baseTradingPermission;
  const tradingPermission = mergeTradingPermission(
    fundingAdjustedPermission,
    squeezeWarning.permissionOverride,
  );
  const action = determineAction({
    direction,
    finalScore,
    confidence,
    entryQuality: entryQualityScore,
    overheat: overheatRisk,
    permission: tradingPermission,
  });
  const preferredEntry = determinePreferredEntry(
    input.regime.regime,
    direction,
    entryQualityScore,
    overheatRisk,
  );
  const entryPlan = calculateEntryTimingPlan(
    input,
    direction,
    entryQualityScore,
    overheatRisk,
  );
  const entryTrigger = validateEntryTrigger({
    input,
    direction,
    entryPlan,
    entryQualityScore,
    overheatRisk,
    dataReliability,
    tradingPermission,
    fundingCrowding,
    squeezeWarning,
  });

  const reasons = [
    `Regime ${input.regime.regime} · ${input.regime.directionBias} · confidence ${input.regime.confidence}%`,
    `MTF trend=${input.regime.trendScore} · alignment=${input.regime.alignmentScore}% · ADX=${input.regime.weightedAdx}`,
    `시장 추세 강도 ${marketTrendStrength}/100 · 종합 방향 확신 ${directionStrength}/100 · bias ${directionScore >= 0 ? "+" : ""}${directionScore}`,
    `최종 방향 ${direction} · final score ${finalScore}/100`,
    `진입 점수 ${entryQualityScore}/100 (${entryQuality}) · 과열 ${overheatRisk}/100 · 반전위험 ${reversalRisk}/100`,
    `데이터 신뢰도 ${dataReliability}/100 · 최종 confidence ${confidence}%`,
    weights.reason,
  ];
  if (newsLimited.reason) reasons.push(newsLimited.reason);
  reasons.push("Funding은 Phase 7-3C부터 방향점수 직접 기여를 중단하고 crowding risk로만 진입 품질을 보정합니다.");
  reasons.push(fundingCrowding.reason);
  reasons.push(openInterest.reason);
  reasons.push(liquidation.reason);
  reasons.push(squeezeWarning.reason);

  if (overheatRisk >= 50) reasons.push("상위 시간봉 과열/급등락 때문에 추격 진입을 억제하고 눌림목 대기를 우선했습니다.");
  if (input.regime.highVolatilityWeight >= 35) reasons.push("고변동 시간봉 비중이 높아 신규 진입 위험을 가중했습니다.");
  if (action === "wait" && direction !== "neutral") reasons.push(`방향은 ${direction}이지만 진입 품질 또는 안전 조건이 부족해 WAIT를 선택했습니다.`);
  if (entryPlan.status === "active" && entryPlan.firstInterestPrice != null && entryPlan.secondInterestPrice != null) {
    reasons.push(
      `Entry Plan: 현재 ${entryPlan.currentPrice} → 1차 ${entryPlan.firstInterestPrice} (예상 ${entryPlan.firstInterestEstimatedScore}/100) → 2차 ${entryPlan.secondInterestPrice} (예상 ${entryPlan.secondInterestEstimatedScore}/100)`,
    );
  }
  reasons.push(`Entry Trigger ${entryTrigger.status} · 조건 ${entryTrigger.passedConditions}/${entryTrigger.totalConditions}`);

  return {
    symbol: "BTCUSDT",
    calculatedAt: now.toISOString(),
    directionScore,
    marketTrendStrength,
    directionStrength,
    finalScore,
    finalConfidence: confidence,
    direction,
    action,
    entryQualityScore,
    entryQuality,
    overheatRisk,
    reversalRisk,
    dataReliability,
    riskLevel,
    tradingPermission,
    preferredEntry,
    entryPlan,
    entryTrigger,
    fundingCrowdingRisk: fundingCrowding.risk,
    fundingCrowdingSide: fundingCrowding.side,
    fundingEntryPenalty: fundingCrowding.entryPenalty,
    fundingCrowdingStatus: fundingCrowding.status,
    openInterestFlowState: openInterest.flowState,
    openInterestDirectionalBias: openInterest.directionalBias,
    openInterestConfidence: openInterest.confidence,
    openInterestEntryAdjustment: openInterest.entryAdjustment,
    openInterestOverheatAdjustment: openInterest.overheatAdjustment,
    openInterestReversalAdjustment: openInterest.reversalAdjustment,
    liquidationState: liquidation.state,
    liquidationDirectionalBias: liquidation.directionalBias,
    liquidationConfidence: liquidation.confidence,
    liquidationEntryAdjustment: liquidation.entryAdjustment,
    liquidationOverheatAdjustment: liquidation.overheatAdjustment,
    liquidationReversalAdjustment: liquidation.reversalAdjustment,
    squeezeWarningStatus: squeezeWarning.status,
    squeezeLongPhase: squeezeWarning.longPhase,
    squeezeShortPhase: squeezeWarning.shortPhase,
    squeezeDominantWarning: squeezeWarning.dominantWarning,
    squeezeEntryPenalty: squeezeWarning.entryPenalty,
    squeezeOverheatAdjustment: squeezeWarning.overheatAdjustment,
    squeezeReversalAdjustment: squeezeWarning.reversalAdjustment,
    squeezePermissionOverride: squeezeWarning.permissionOverride,
    squeezeRecommendedResponse: squeezeWarning.recommendedResponse,
    weights,
    reasons,
    invalidationConditions: buildInvalidationConditions(input, direction),
    componentContributions: {
      technical: round(contributions.technical),
      news: round(contributions.news),
      funding: round(contributions.funding),
      regime: round(contributions.regime),
    },
    strategyVersion: "decision-engine-v2.8-squeeze-aware",
  };
}
