import type {
  ConflictLevel,
  DirectionVotes,
  MarketComponent,
  MarketDirection,
  MarketIntelligenceResult,
  MarketSignal,
  RiskLevel,
} from "./types";

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(Math.max(value, min), max);

const round = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
};

const directionValue: Record<MarketDirection, number> = {
  bullish: 1,
  neutral: 0,
  bearish: -1,
};

export function determineMarketDirection(score: number): MarketDirection {
  if (score >= 57) return "bullish";
  if (score <= 43) return "bearish";
  return "neutral";
}

export function determineMarketSignal(score: number): MarketSignal {
  if (score >= 80) return "strong_bullish";
  if (score >= 65) return "bullish";
  if (score >= 50) return "watch";
  if (score >= 35) return "caution";
  if (score >= 20) return "bearish";
  return "strong_bearish";
}

function determineConflict(votes: DirectionVotes): ConflictLevel {
  const opposing = Math.min(votes.bullish, votes.bearish);
  const directionalTotal = votes.bullish + votes.bearish;
  const neutralIsDominant =
    votes.neutral >= votes.bullish && votes.neutral >= votes.bearish;

  // 강세와 약세가 모두 큰 비중을 차지할 때만 실제 충돌로 봅니다.
  if (opposing >= 0.25) return "high";
  if (opposing >= 0.1) return "medium";

  // 중립 우세 자체는 충돌이 아닙니다. 다만 중립 아래에 방향성 신호가
  // 적지 않게 섞여 있으면 방향 확인이 필요한 상태로 분류합니다.
  if (neutralIsDominant && directionalTotal >= 0.3) return "medium";

  return "low";
}

function determineRisk(input: {
  score: number;
  confidence: number;
  conflict: ConflictLevel;
  consensusStrength: number;
}): RiskLevel {
  if (input.score <= 20 && input.confidence >= 65) return "extreme";
  if (input.score <= 35 || input.conflict === "high") return "high";
  if (
    input.score < 50 ||
    input.confidence < 60 ||
    input.consensusStrength < 50 ||
    input.conflict === "medium"
  ) {
    return "medium";
  }
  return "low";
}

export function calculateMarketScore(
  components: MarketComponent[],
  calculatedAt = new Date().toISOString(),
): Omit<MarketIntelligenceResult, "summary" | "reasons"> {
  const usable = components.filter(
    (component) =>
      component.isFresh &&
      Number.isFinite(component.score) &&
      Number.isFinite(component.confidence),
  );

  if (usable.length < 2) {
    throw new Error(
      `Market Intelligence 계산에는 최신 데이터가 최소 2개 필요합니다. 현재 ${usable.length}개입니다.`,
    );
  }

  // 신뢰도가 낮은 지표는 완전히 제외하지 않고 영향력만 완만하게 줄입니다.
  const weightedInputs = usable.map((component) => ({
    component,
    rawWeight:
      component.configuredWeight *
      component.freshnessFactor *
      (0.7 + clamp(component.confidence) / 100 * 0.3),
  }));

  const rawWeightTotal = weightedInputs.reduce(
    (sum, item) => sum + item.rawWeight,
    0,
  );
  if (rawWeightTotal <= 0) {
    throw new Error("Market Intelligence 유효 가중치 합계가 0입니다.");
  }

  const normalized = weightedInputs.map(({ component, rawWeight }) => {
    const effectiveWeight = rawWeight / rawWeightTotal;
    return {
      ...component,
      effectiveWeight,
      contribution: component.score * effectiveWeight,
      directionalContribution:
        directionValue[component.direction] * effectiveWeight,
    };
  });

  const rawScore = clamp(
    normalized.reduce(
      (sum, component) => sum + (component.contribution ?? 0),
      0,
    ),
  );

  const votes: DirectionVotes = {
    bullish: normalized
      .filter((item) => item.direction === "bullish")
      .reduce((sum, item) => sum + item.effectiveWeight, 0),
    neutral: normalized
      .filter((item) => item.direction === "neutral")
      .reduce((sum, item) => sum + item.effectiveWeight, 0),
    bearish: normalized
      .filter((item) => item.direction === "bearish")
      .reduce((sum, item) => sum + item.effectiveWeight, 0),
  };

  const consensusDirection =
    votes.bullish > votes.bearish && votes.bullish > votes.neutral
      ? "bullish"
      : votes.bearish > votes.bullish && votes.bearish > votes.neutral
        ? "bearish"
        : "neutral";

  const winningShare = Math.max(votes.bullish, votes.neutral, votes.bearish);
  const consensusStrength = clamp(winningShare * 100);
  const conflictLevel = determineConflict(votes);

  // 방향 합의는 원점수를 덮지 않고 최대 ±4점만 보정합니다.
  const directionalNet = votes.bullish - votes.bearish;
  const consensusAdjustment = clamp(directionalNet * 4, -4, 4);
  const score = clamp(rawScore + consensusAdjustment);

  const weightedConfidence = normalized.reduce(
    (sum, component) =>
      sum + component.confidence * component.effectiveWeight,
    0,
  );
  const coverageFactor = 0.75 + (normalized.length / 3) * 0.25;
  const averageFreshness = normalized.reduce(
    (sum, component) => sum + component.freshnessFactor * component.effectiveWeight,
    0,
  );
  const consensusFactor = 0.85 + (consensusStrength / 100) * 0.15;
  const confidence = clamp(
    weightedConfidence * coverageFactor * averageFreshness * consensusFactor,
  );

  const scoreDirection = determineMarketDirection(score);
  // 점수와 투표가 충돌하면 과도한 방향 확정을 피하고 중립 처리합니다.
  const direction: MarketDirection =
    consensusDirection !== "neutral" && scoreDirection === consensusDirection
      ? consensusDirection
      : scoreDirection === "neutral"
        ? "neutral"
        : consensusStrength >= 65
          ? consensusDirection
          : "neutral";

  const riskLevel = determineRisk({
    score,
    confidence,
    conflict: conflictLevel,
    consensusStrength,
  });

  return {
    symbol: "BTCUSDT",
    calculatedAt,
    score: round(score),
    rawScore: round(rawScore),
    consensusAdjustment: round(consensusAdjustment),
    confidence: round(confidence),
    direction,
    signal: determineMarketSignal(score),
    riskLevel,
    conflictLevel,
    consensusStrength: round(consensusStrength),
    directionVotes: {
      bullish: round(votes.bullish * 100),
      neutral: round(votes.neutral * 100),
      bearish: round(votes.bearish * 100),
    },
    components: normalized.map((component) => ({
      ...component,
      effectiveWeight: round(component.effectiveWeight, 6),
      contribution: round(component.contribution ?? 0),
      directionalContribution: round(
        component.directionalContribution ?? 0,
        6,
      ),
    })),
    availableComponentCount: normalized.length,
    strategyVersion: "market-intelligence-v2.1",
  };
}
