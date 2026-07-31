import type { DecisionWeights, RiskLevel } from "./types";

export const WEIGHT_LIMITS = {
  news: { min: 0.1, max: 0.42 },
  funding: { min: 0.06, max: 0.22 },
  etf: { min: 0, max: 0.2 },
  maxNonTechnical: 0.65,
} as const;

export const BASE_WEIGHTS = {
  news: 0.2,
  funding: 0.1,
  etf: 0.1,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return clamp(value, 0, 100);
}

function normalizeFreshness(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1;
  }

  return clamp(value, 0, 1);
}

export interface DynamicWeightInput {
  newsConfidence: number;
  conflictScore: number;
  marketPressure?: string;
  articleCount?: number;
  fundingConfidence: number;
  fundingRatePercent: number;
  fundingRisk: RiskLevel;
  etfScore?: number;
  etfConfidence?: number;
  etfFreshness?: number;
}

export function calculateDynamicWeights(input: DynamicWeightInput): DecisionWeights {
  let newsWeight: number = BASE_WEIGHTS.news;
  let fundingWeight: number = BASE_WEIGHTS.funding;
  let etfWeight = 0;
  const reasons: string[] = [];
  const articleCount = input.articleCount ?? 0;

  if (input.newsConfidence >= 80) {
    newsWeight += 0.15;
    reasons.push("뉴스 신뢰도 매우 높음");
  } else if (input.newsConfidence >= 65) {
    newsWeight += 0.1;
    reasons.push("뉴스 신뢰도 높음");
  } else if (input.newsConfidence >= 50) {
    newsWeight += 0.05;
    reasons.push("뉴스 신뢰도 보통");
  } else {
    newsWeight -= 0.05;
    reasons.push("뉴스 신뢰도 낮음");
  }

  if (
    input.marketPressure === "strong_bullish" ||
    input.marketPressure === "strong_bearish"
  ) {
    newsWeight += 0.08;
    reasons.push("강한 뉴스 압력");
  }

  if (articleCount >= 8) {
    newsWeight += 0.06;
    reasons.push("충분한 기사 수");
  } else if (articleCount <= 2) {
    newsWeight -= 0.05;
    reasons.push("기사 수 부족");
  }

  if (input.conflictScore >= 70) {
    newsWeight -= 0.1;
    reasons.push("뉴스 방향 충돌 매우 큼");
  } else if (input.conflictScore >= 40) {
    newsWeight -= 0.05;
    reasons.push("뉴스 방향 충돌 존재");
  }

  if (input.fundingConfidence >= 70) {
    fundingWeight += 0.08;
    reasons.push("펀딩 신뢰도 높음");
  } else if (input.fundingConfidence >= 55) {
    fundingWeight += 0.04;
    reasons.push("펀딩 신뢰도 보통");
  } else {
    fundingWeight -= 0.02;
    reasons.push("펀딩 신뢰도 낮음");
  }

  const absoluteFundingRate = Math.abs(input.fundingRatePercent);

  if (absoluteFundingRate >= 0.05) {
    fundingWeight += 0.07;
    reasons.push("펀딩 과열 신호 강함");
  } else if (absoluteFundingRate >= 0.02) {
    fundingWeight += 0.04;
    reasons.push("펀딩 쏠림 신호 존재");
  }

  if (input.fundingRisk === "high" || input.fundingRisk === "critical") {
    fundingWeight += 0.03;
    reasons.push("펀딩 위험도 상승");
  }

  const hasEtfSignal =
    input.etfScore !== undefined &&
    Number.isFinite(input.etfScore) &&
    input.etfConfidence !== undefined &&
    Number.isFinite(input.etfConfidence);

  if (hasEtfSignal) {
    const etfScore = normalizePercent(input.etfScore as number);
    const etfConfidence = normalizePercent(input.etfConfidence as number);
    const etfFreshness = normalizeFreshness(input.etfFreshness);

    etfWeight = BASE_WEIGHTS.etf;

    if (etfConfidence >= 80) {
      etfWeight += 0.07;
      reasons.push("ETF 신뢰도 매우 높음");
    } else if (etfConfidence >= 65) {
      etfWeight += 0.04;
      reasons.push("ETF 신뢰도 높음");
    } else if (etfConfidence < 45) {
      etfWeight -= 0.06;
      reasons.push("ETF 신뢰도 낮음");
    }

    const etfDistanceFromNeutral = Math.abs(etfScore - 50);
    if (etfDistanceFromNeutral >= 30) {
      etfWeight += 0.04;
      reasons.push("ETF 방향성 매우 강함");
    } else if (etfDistanceFromNeutral >= 18) {
      etfWeight += 0.02;
      reasons.push("ETF 방향성 뚜렷함");
    } else if (etfDistanceFromNeutral <= 5) {
      etfWeight -= 0.03;
      reasons.push("ETF 신호 중립");
    }

    if (etfFreshness < 0.35) {
      etfWeight *= 0.25;
      reasons.push("ETF 데이터 오래됨");
    } else if (etfFreshness < 0.65) {
      etfWeight *= 0.6;
      reasons.push("ETF 데이터 최신성 낮음");
    }
  } else {
    reasons.push("ETF 데이터 없음: 가중치 제외");
  }

  newsWeight = clamp(newsWeight, WEIGHT_LIMITS.news.min, WEIGHT_LIMITS.news.max);
  fundingWeight = clamp(
    fundingWeight,
    WEIGHT_LIMITS.funding.min,
    WEIGHT_LIMITS.funding.max,
  );
  etfWeight = clamp(etfWeight, WEIGHT_LIMITS.etf.min, WEIGHT_LIMITS.etf.max);

  const nonTechnical = newsWeight + fundingWeight + etfWeight;
  if (nonTechnical > WEIGHT_LIMITS.maxNonTechnical) {
    const scale = WEIGHT_LIMITS.maxNonTechnical / nonTechnical;
    newsWeight *= scale;
    fundingWeight *= scale;
    etfWeight *= scale;
    reasons.push("비기술 신호 총 가중치 상한 적용");
  }

  return {
    technical: round4(1 - newsWeight - fundingWeight - etfWeight),
    news: round4(newsWeight),
    funding: round4(fundingWeight),
    etf: round4(etfWeight),
    reason: reasons.join(", "),
  };
}
