import {
  compareStrategyCandidate,
  DEFAULT_STRATEGY_CANDIDATES,
  type CandidateComparisonResult,
  type HistoricalDecisionObservation,
  type StrategyCandidate,
} from "./StrategyCandidateComparator";

export type RobustnessStatus =
  | "insufficient"
  | "robust"
  | "watch"
  | "overfit";

export interface WalkForwardOptions {
  trainingRatio: number;
  minimumTrainingTrades: number;
  minimumValidationTrades: number;
}

export interface WalkForwardValidationResult {
  candidate: StrategyCandidate;
  training: CandidateComparisonResult;
  validation: CandidateComparisonResult;
  trainingObservationCount: number;
  validationObservationCount: number;
  splitAt: string | null;
  returnRetentionRatio: number | null;
  profitFactorRetentionRatio: number | null;
  robustnessStatus: RobustnessStatus;
  validationEligible: boolean;
  reason: string;
}

export const DEFAULT_WALK_FORWARD_OPTIONS: WalkForwardOptions = {
  trainingRatio: 0.7,
  minimumTrainingTrades: 30,
  minimumValidationTrades: 10,
};

function round(value: number, digits = 6): number {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

function validateOptions(options: WalkForwardOptions): void {
  if (
    !Number.isFinite(options.trainingRatio) ||
    options.trainingRatio <= 0 ||
    options.trainingRatio >= 1 ||
    !Number.isInteger(options.minimumTrainingTrades) ||
    options.minimumTrainingTrades <= 0 ||
    !Number.isInteger(options.minimumValidationTrades) ||
    options.minimumValidationTrades <= 0
  ) {
    throw new Error("워크포워드 검증 설정이 올바르지 않습니다.");
  }
}

function calculateRetention(
  training: number | null,
  validation: number | null,
): number | null {
  if (
    training === null ||
    validation === null ||
    training <= 0
  ) {
    return null;
  }
  return round(validation / training);
}

function determineRobustness(params: {
  training: CandidateComparisonResult;
  validation: CandidateComparisonResult;
  options: WalkForwardOptions;
  returnRetentionRatio: number | null;
}): { status: RobustnessStatus; eligible: boolean; reason: string } {
  const { training, validation, options, returnRetentionRatio } = params;

  if (
    training.selectedTrades < options.minimumTrainingTrades ||
    validation.selectedTrades < options.minimumValidationTrades
  ) {
    return {
      status: "insufficient",
      eligible: false,
      reason:
        `학습 ${options.minimumTrainingTrades}회·검증 ` +
        `${options.minimumValidationTrades}회 이상의 선택 거래가 필요합니다.`,
    };
  }

  const trainingReturn = training.expectedReturnPercent ?? 0;
  const validationReturn = validation.expectedReturnPercent ?? 0;
  const validationProfitFactor = validation.profitFactor ?? 0;

  if (trainingReturn > 0 && validationReturn <= 0) {
    return {
      status: "overfit",
      eligible: false,
      reason: "학습 구간은 수익이지만 검증 구간 기대수익이 0 이하입니다.",
    };
  }

  if (validationReturn <= 0 || validationProfitFactor < 1) {
    return {
      status: "overfit",
      eligible: false,
      reason: "검증 구간 수익성 또는 수익 팩터가 유지되지 않았습니다.",
    };
  }

  if (
    returnRetentionRatio !== null &&
    returnRetentionRatio >= 0.5 &&
    validation.maxDrawdownPercent <=
      Math.max(training.maxDrawdownPercent * 1.5, 0.5)
  ) {
    return {
      status: "robust",
      eligible: true,
      reason: "검증 구간에서도 기대수익과 낙폭 안정성이 유지됐습니다.",
    };
  }

  return {
    status: "watch",
    eligible: true,
    reason: "검증 수익은 양수지만 학습 대비 성과 유지율을 더 관찰해야 합니다.",
  };
}

export function validateStrategyCandidatesWalkForward(
  observations: readonly HistoricalDecisionObservation[],
  candidates: readonly StrategyCandidate[] = DEFAULT_STRATEGY_CANDIDATES,
  options: WalkForwardOptions = DEFAULT_WALK_FORWARD_OPTIONS,
): WalkForwardValidationResult[] {
  validateOptions(options);

  const chronological = [...observations].sort((left, right) => {
    const difference =
      Date.parse(left.decidedAt) - Date.parse(right.decidedAt);
    return difference !== 0 ? difference : left.id - right.id;
  });

  const splitIndex =
    chronological.length < 2
      ? chronological.length
      : Math.min(
          chronological.length - 1,
          Math.max(1, Math.floor(chronological.length * options.trainingRatio)),
        );
  const trainingObservations = chronological.slice(0, splitIndex);
  const validationObservations = chronological.slice(splitIndex);
  const splitAt = validationObservations[0]?.decidedAt ?? null;

  return candidates.map((candidate) => {
    const training = compareStrategyCandidate(candidate, trainingObservations);
    const validation = compareStrategyCandidate(
      candidate,
      validationObservations,
    );
    const returnRetentionRatio = calculateRetention(
      training.expectedReturnPercent,
      validation.expectedReturnPercent,
    );
    const profitFactorRetentionRatio = calculateRetention(
      training.profitFactor,
      validation.profitFactor,
    );
    const robustness = determineRobustness({
      training,
      validation,
      options,
      returnRetentionRatio,
    });

    return {
      candidate,
      training,
      validation,
      trainingObservationCount: trainingObservations.length,
      validationObservationCount: validationObservations.length,
      splitAt,
      returnRetentionRatio,
      profitFactorRetentionRatio,
      robustnessStatus: robustness.status,
      validationEligible: robustness.eligible,
      reason: robustness.reason,
    };
  });
}
