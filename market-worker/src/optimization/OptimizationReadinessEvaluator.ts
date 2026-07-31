export type OptimizationOverallStatus =
  | "collecting"
  | "ready_for_review"
  | "attention";

export type OptimizationCheckStatus =
  | "complete"
  | "collecting"
  | "attention"
  | "locked";

export interface OptimizationReadinessInput {
  performance: {
    strategyCount: number;
    readyCount: number;
    provisionalCount: number;
    maxTrades: number;
  };
  candidates: {
    candidateCount: number;
    eligibleCount: number;
    maxSelectedTrades: number;
  };
  validation: {
    candidateCount: number;
    robustCount: number;
    watchCount: number;
    overfitCount: number;
    insufficientCount: number;
  };
  recommendation: {
    id: number | null;
    status: "recommended" | "hold" | null;
    selectedCandidateName: string | null;
    requiresManualApproval: boolean;
  };
}

export interface OptimizationReadinessCheck {
  key: "performance" | "candidates" | "validation" | "recommendation" | "manual_lock";
  label: string;
  status: OptimizationCheckStatus;
  detail: string;
}

export interface OptimizationReadinessResult {
  overallStatus: OptimizationOverallStatus;
  progressPercent: number;
  safeForAutomaticApplication: false;
  summary: string;
  checks: OptimizationReadinessCheck[];
}

function checkScore(status: OptimizationCheckStatus): number {
  if (status === "complete" || status === "locked") return 20;
  if (status === "collecting") return 8;
  return 4;
}

export function evaluateOptimizationReadiness(
  input: OptimizationReadinessInput,
): OptimizationReadinessResult {
  const performanceStatus: OptimizationCheckStatus =
    input.performance.readyCount > 0
      ? "complete"
      : "collecting";
  const candidateStatus: OptimizationCheckStatus =
    input.candidates.eligibleCount > 0
      ? "complete"
      : "collecting";
  const validationPassed =
    input.validation.robustCount + input.validation.watchCount > 0;
  const validationStatus: OptimizationCheckStatus = validationPassed
    ? "complete"
    : input.validation.overfitCount > 0 &&
        input.validation.insufficientCount === 0
      ? "attention"
      : "collecting";
  const recommendationStatus: OptimizationCheckStatus =
    input.recommendation.status === "recommended"
      ? "complete"
      : validationStatus === "attention"
        ? "attention"
        : "collecting";
  const manualLockStatus: OptimizationCheckStatus =
    input.recommendation.requiresManualApproval
      ? "locked"
      : "attention";

  const checks: OptimizationReadinessCheck[] = [
    {
      key: "performance",
      label: "실전 모의매매 표본",
      status: performanceStatus,
      detail:
        input.performance.readyCount > 0
          ? `50회 이상 전략 ${input.performance.readyCount}개`
          : `최대 ${input.performance.maxTrades}회 · 50회까지 수집 중`,
    },
    {
      key: "candidates",
      label: "전략 후보 비교",
      status: candidateStatus,
      detail:
        input.candidates.eligibleCount > 0
          ? `비교 가능 후보 ${input.candidates.eligibleCount}개`
          : `최대 선택 거래 ${input.candidates.maxSelectedTrades}회 · 30회 필요`,
    },
    {
      key: "validation",
      label: "기간 분리 검증",
      status: validationStatus,
      detail: validationPassed
        ? `안정 ${input.validation.robustCount}개 · 관찰 ${input.validation.watchCount}개`
        : `표본 부족 ${input.validation.insufficientCount}개 · 과최적화 ${input.validation.overfitCount}개`,
    },
    {
      key: "recommendation",
      label: "안전 전략 추천",
      status: recommendationStatus,
      detail:
        input.recommendation.status === "recommended"
          ? `${input.recommendation.selectedCandidateName ?? "선택 후보"} 추천`
          : "검증 기준 충족 전까지 추천 보류",
    },
    {
      key: "manual_lock",
      label: "수동 승인 잠금",
      status: manualLockStatus,
      detail: input.recommendation.requiresManualApproval
        ? "자동 설정 반영 차단됨"
        : "수동 승인 잠금을 확인해야 합니다.",
    },
  ];

  const overallStatus: OptimizationOverallStatus =
    manualLockStatus === "attention" || validationStatus === "attention"
      ? "attention"
      : recommendationStatus === "complete"
        ? "ready_for_review"
        : "collecting";
  const progressPercent = checks.reduce(
    (sum, check) => sum + checkScore(check.status),
    0,
  );

  return {
    overallStatus,
    progressPercent,
    safeForAutomaticApplication: false,
    summary:
      overallStatus === "ready_for_review"
        ? "검증된 추천이 준비됐습니다. 실제 반영 전 수동 검토가 필요합니다."
        : overallStatus === "attention"
          ? "검증 또는 안전 잠금 항목을 확인해야 합니다."
          : "Phase 5 시스템은 정상이며 신뢰 가능한 표본을 수집하고 있습니다.",
    checks,
  };
}
