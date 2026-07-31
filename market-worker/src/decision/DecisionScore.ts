import type { DecisionEngineInput, DecisionWeights, Direction } from "./types";

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function assertFiniteValue(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
}

export function scoreToDirection(score: number): Direction {
  if (score >= 57) return "bullish";
  if (score <= 43) return "bearish";
  return "neutral";
}

export function validateDecisionInput(input: DecisionEngineInput): void {
  const values: Array<[number, string]> = [
    [input.technical.score, "기술점수"],
    [input.technical.confidence, "기술 신뢰도"],
    [input.news.score, "뉴스점수"],
    [input.news.confidence, "뉴스 신뢰도"],
    [input.news.conflictScore, "뉴스 충돌점수"],
    [input.funding.score, "펀딩점수"],
    [input.funding.confidence, "펀딩 신뢰도"],
    [input.funding.fundingRatePercent, "펀딩비"],
  ];

  if (input.etf) {
    values.push(
      [input.etf.score, "ETF 점수"],
      [input.etf.confidence, "ETF 신뢰도"],
    );

    if (input.etf.netFlow !== undefined) {
      values.push([input.etf.netFlow, "ETF 순유입"]);
    }

    if (input.etf.freshness !== undefined) {
      values.push([input.etf.freshness, "ETF 최신성"]);
    }
  }

  for (const [value, label] of values) {
    assertFiniteValue(value, label);
  }
}

export function calculateWeightedScore(
  input: DecisionEngineInput,
  weights: DecisionWeights,
): number {
  const etfWeight = weights.etf ?? 0;
  const etfContribution = input.etf
    ? input.etf.score * etfWeight
    : 0;

  return clamp(
    input.technical.score * weights.technical +
      input.news.score * weights.news +
      input.funding.score * weights.funding +
      etfContribution,
    0,
    100,
  );
}
