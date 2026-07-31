import type {
  RobustnessStatus,
  WalkForwardValidationResult,
} from "./StrategyWalkForwardValidator";

export type RecommendationStatus = "recommended" | "hold";

export interface RankedStrategyCandidate {
  candidateKey: string;
  candidateName: string;
  candidateKind: string;
  rank: number | null;
  score: number;
  eligible: boolean;
  robustnessStatus: RobustnessStatus;
  validationTrades: number;
  validationExpectedReturn: number | null;
  validationProfitFactor: number | null;
  validationMaxDrawdown: number;
  returnRetentionRatio: number | null;
  reason: string;
}

export interface StrategyRecommendation {
  status: RecommendationStatus;
  selectedCandidateKey: string | null;
  selectedCandidateName: string | null;
  selectedCandidateKind: string | null;
  recommendationScore: number | null;
  confidence: number;
  reason: string;
  eligibleCandidateCount: number;
  rankings: RankedStrategyCandidate[];
}

function round(value: number, digits = 4): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function calculateCandidateScore(result: WalkForwardValidationResult): number {
  if (!result.validationEligible) return 0;

  const robustnessScore =
    result.robustnessStatus === "robust"
      ? 35
      : result.robustnessStatus === "watch"
        ? 20
        : 0;
  const expectedReturn = result.validation.expectedReturnPercent ?? 0;
  const expectedReturnScore =
    (clamp(expectedReturn, -1, 1) + 1) * 12.5;
  const profitFactorScore =
    (clamp(result.validation.profitFactor ?? 0, 0, 3) / 3) * 20;
  const drawdownScore =
    (1 - clamp(result.validation.maxDrawdownPercent, 0, 10) / 10) * 15;
  const retentionScore =
    (clamp(result.returnRetentionRatio ?? 0, 0, 1.5) / 1.5) * 5;

  return round(
    robustnessScore +
      expectedReturnScore +
      profitFactorScore +
      drawdownScore +
      retentionScore,
  );
}

function rejectionReason(result: WalkForwardValidationResult): string {
  if (result.robustnessStatus === "insufficient") {
    return `표본 부족: 학습 ${result.training.selectedTrades}회, 검증 ${result.validation.selectedTrades}회`;
  }
  if (result.robustnessStatus === "overfit") {
    return `과최적화 제외: ${result.reason}`;
  }
  return result.reason;
}

export function recommendStrategy(
  validationResults: readonly WalkForwardValidationResult[],
): StrategyRecommendation {
  const keys = new Set<string>();
  for (const result of validationResults) {
    if (keys.has(result.candidate.key)) {
      throw new Error(`중복 검증 후보가 있습니다: ${result.candidate.key}`);
    }
    keys.add(result.candidate.key);
  }

  const scored = validationResults.map((result) => ({
    result,
    score: calculateCandidateScore(result),
  }));
  const eligible = scored
    .filter(({ result }) => result.validationEligible)
    .sort((left, right) => right.score - left.score);
  const rankByKey = new Map(
    eligible.map((item, index) => [item.result.candidate.key, index + 1]),
  );
  const rankings = scored
    .map(({ result, score }): RankedStrategyCandidate => ({
      candidateKey: result.candidate.key,
      candidateName: result.candidate.name,
      candidateKind: result.candidate.kind,
      rank: rankByKey.get(result.candidate.key) ?? null,
      score,
      eligible: result.validationEligible,
      robustnessStatus: result.robustnessStatus,
      validationTrades: result.validation.selectedTrades,
      validationExpectedReturn: result.validation.expectedReturnPercent,
      validationProfitFactor: result.validation.profitFactor,
      validationMaxDrawdown: result.validation.maxDrawdownPercent,
      returnRetentionRatio: result.returnRetentionRatio,
      reason: result.validationEligible
        ? result.reason
        : rejectionReason(result),
    }))
    .sort((left, right) => {
      if (left.rank === null && right.rank === null) return 0;
      if (left.rank === null) return 1;
      if (right.rank === null) return -1;
      return left.rank - right.rank;
    });

  if (eligible.length === 0) {
    return {
      status: "hold",
      selectedCandidateKey: null,
      selectedCandidateName: null,
      selectedCandidateKind: null,
      recommendationScore: null,
      confidence: 0,
      reason:
        "학습 30회·검증 10회와 안정성 기준을 통과한 후보가 없어 추천을 보류합니다.",
      eligibleCandidateCount: 0,
      rankings,
    };
  }

  const selected = eligible[0];
  const runnerUpScore = eligible[1]?.score ?? 0;
  const scoreGap = selected.score - runnerUpScore;
  const confidence = round(
    clamp(
      selected.score * 0.75 +
        clamp(scoreGap, 0, 20) * 1.25,
      0,
      100,
    ),
    2,
  );

  return {
    status: "recommended",
    selectedCandidateKey: selected.result.candidate.key,
    selectedCandidateName: selected.result.candidate.name,
    selectedCandidateKind: selected.result.candidate.kind,
    recommendationScore: selected.score,
    confidence,
    reason:
      `${selected.result.candidate.name} 후보가 검증 안정성·기대수익·` +
      "수익 팩터·최대 낙폭 종합 점수에서 가장 우수합니다.",
    eligibleCandidateCount: eligible.length,
    rankings,
  };
}
