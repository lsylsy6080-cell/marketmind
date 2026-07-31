import { calculateFinalConfidence } from "./ConfidenceCalculator";
import { determineFinalAction, determineTradingPermission } from "./DecisionRules";
import {
  calculateWeightedScore,
  round2,
  scoreToDirection,
  validateDecisionInput,
} from "./DecisionScore";
import { determineFinalRisk, normalizeRiskLevel } from "./RiskAnalyzer";
import { calculateSignalAlignment } from "./SignalAlignment";
import { calculateDynamicWeights } from "./weights";
import type {
  DecisionEngineInput,
  DecisionEngineResult,
  DecisionReason,
  Direction,
  FinalAction,
  RiskLevel,
  SignalAlignment,
  TradingPermission,
} from "./types";

/**
 * 외부 분석기가 direction을 생략하거나 score와 다른 direction을 전달해도
 * Decision Engine 내부 판단은 동일한 점수 기준을 사용하도록 정규화합니다.
 */
function normalizeInputDirections(
  input: DecisionEngineInput,
): DecisionEngineInput {
  return {
    ...input,
    technical: {
      ...input.technical,
      direction: scoreToDirection(input.technical.score),
    },
    news: {
      ...input.news,
      direction: scoreToDirection(input.news.score),
    },
    funding: {
      ...input.funding,
      direction: scoreToDirection(input.funding.score),
    },
    etf: input.etf
      ? {
          ...input.etf,
          direction: scoreToDirection(input.etf.score),
        }
      : undefined,
  };
}

/**
 * caution 상태에서는 강한 진입을 허용하지 않습니다.
 * blocked 상태와 신호 conflict 상태에서는 신규 방향성 행동 대신 관망합니다.
 */
function applyFinalSafetyGuard(
  action: FinalAction,
  permission: TradingPermission,
  alignment: SignalAlignment,
): FinalAction {
  if (permission === "blocked" || alignment === "conflict") {
    return "wait";
  }

  if (permission === "caution" && action === "strong_buy") {
    return "buy";
  }

  return action;
}

function buildDecisionSummary(
  action: FinalAction,
  finalScore: number,
  finalConfidence: number,
  alignment: SignalAlignment,
  risk: RiskLevel,
  technicalDirection: Direction,
  newsDirection: Direction,
  fundingDirection: Direction,
  etfDirection: Direction | null,
  fundingRatePercent: number,
  tradingPermission: TradingPermission,
): string {
  const directionLabels: Record<Direction, string> = {
    bullish: "강세",
    neutral: "중립",
    bearish: "약세",
  };

  const actionLabels: Record<FinalAction, string> = {
    strong_buy: "강한 매수 우위",
    buy: "매수 우위",
    wait: "관망",
    reduce: "비중 축소",
    sell: "매도 우위",
  };

  const riskLabels: Record<RiskLevel, string> = {
    low: "낮음",
    normal: "보통",
    high: "높음",
    critical: "매우 높음",
  };

  const alignmentLabels: Record<SignalAlignment, string> = {
    strong_alignment: "신호들이 강하게 일치합니다.",
    alignment: "신호들이 대체로 같은 방향입니다.",
    mixed: "신호들이 혼재되어 있습니다.",
    conflict: "신호들이 서로 충돌하고 있습니다.",
  };

  const permissionLabels: Record<TradingPermission, string> = {
    allowed: "거래 가능",
    caution: "주의 필요",
    blocked: "거래 차단",
  };

  const absoluteFundingRate = Math.abs(fundingRatePercent);
  const fundingCondition =
    absoluteFundingRate >= 0.05
      ? "강한 과열"
      : absoluteFundingRate >= 0.03
        ? "과열"
        : absoluteFundingRate >= 0.01
          ? "약한 쏠림"
          : "중립";

  const signalSummary = [
    `기술 신호는 ${directionLabels[technicalDirection]}`,
    `뉴스는 ${directionLabels[newsDirection]}`,
    `펀딩은 ${directionLabels[fundingDirection]}이며 ${fundingCondition} 상태`,
    etfDirection ? `ETF는 ${directionLabels[etfDirection]}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");

  return [
    `${signalSummary}입니다.`,
    alignmentLabels[alignment],
    `최종 판단은 ${actionLabels[action]}이고 점수 ${round2(finalScore)}점, 신뢰도 ${round2(finalConfidence)}%, 위험도 ${riskLabels[risk]}, 거래 상태는 ${permissionLabels[tradingPermission]}입니다.`,
  ].join(" ");
}

export function runDecisionEngine(
  input: DecisionEngineInput,
): DecisionEngineResult {
  validateDecisionInput(input);

  const normalizedInput = normalizeInputDirections(input);
  const fundingRisk = normalizeRiskLevel(normalizedInput.funding.riskLevel);

  const weights = calculateDynamicWeights({
    newsConfidence: normalizedInput.news.confidence,
    conflictScore: normalizedInput.news.conflictScore,
    marketPressure: normalizedInput.news.marketPressure,
    articleCount: normalizedInput.news.articleCount,
    fundingConfidence: normalizedInput.funding.confidence,
    fundingRatePercent: normalizedInput.funding.fundingRatePercent,
    fundingRisk,
    etfScore: normalizedInput.etf?.score,
    etfConfidence: normalizedInput.etf?.confidence,
    etfFreshness: normalizedInput.etf?.freshness,
  });

  const finalScore = calculateWeightedScore(normalizedInput, weights);
  const alignmentScores = [
    normalizedInput.technical.score,
    normalizedInput.news.score,
    normalizedInput.funding.score,
  ];

  if (normalizedInput.etf && (weights.etf ?? 0) > 0) {
    alignmentScores.push(normalizedInput.etf.score);
  }

  const alignment = calculateSignalAlignment(alignmentScores);
  const finalConfidence = calculateFinalConfidence(
    normalizedInput,
    weights,
    alignment,
  );

  const finalRisk = determineFinalRisk({
    technicalRisk: normalizeRiskLevel(normalizedInput.technical.riskLevel),
    newsRisk: normalizeRiskLevel(normalizedInput.news.riskLevel),
    fundingRisk,
    etfRisk: normalizedInput.etf
      ? normalizeRiskLevel(normalizedInput.etf.riskLevel)
      : undefined,
    etfFreshness: normalizedInput.etf?.freshness,
    conflictScore: normalizedInput.news.conflictScore,
    alignment,
  });

  const tradingPermission = determineTradingPermission({
    technicalPermission: normalizedInput.technical.tradingPermission,
    fundingPermission: normalizedInput.funding.tradingPermission,
    finalRisk,
    finalConfidence,
    alignment,
  });

  const ruleAction = determineFinalAction({
    finalScore,
    finalConfidence,
    permission: tradingPermission,
    risk: finalRisk,
  });

  const action = applyFinalSafetyGuard(
    ruleAction,
    tradingPermission,
    alignment,
  );
  const direction = scoreToDirection(finalScore);
  const technicalDirection = normalizedInput.technical.direction as Direction;
  const newsDirection = normalizedInput.news.direction as Direction;
  const fundingDirection = normalizedInput.funding.direction as Direction;
  const etfDirection = normalizedInput.etf
    ? (normalizedInput.etf.direction as Direction)
    : null;

  const reasons: DecisionReason[] = [
    {
      type: "technical",
      score: round2(normalizedInput.technical.score),
      confidence: round2(normalizedInput.technical.confidence),
      direction: technicalDirection,
      regime: normalizedInput.technical.marketRegime,
    },
    {
      type: "news",
      score: round2(normalizedInput.news.score),
      confidence: round2(normalizedInput.news.confidence),
      direction: newsDirection,
      pressure: normalizedInput.news.marketPressure,
      dominant_category: normalizedInput.news.dominantCategory,
      conflict_score: round2(normalizedInput.news.conflictScore),
    },
    {
      type: "funding",
      score: round2(normalizedInput.funding.score),
      confidence: round2(normalizedInput.funding.confidence),
      direction: fundingDirection,
      funding_rate: normalizedInput.funding.fundingRate,
      funding_rate_percent: normalizedInput.funding.fundingRatePercent,
      annualized_rate_percent: normalizedInput.funding.annualizedRatePercent,
      risk_level: fundingRisk,
      trading_permission: normalizedInput.funding.tradingPermission,
    },
  ];

  if (normalizedInput.etf && etfDirection) {
    reasons.push({
      type: "etf",
      score: round2(normalizedInput.etf.score),
      confidence: round2(normalizedInput.etf.confidence),
      direction: etfDirection,
      net_flow: normalizedInput.etf.netFlow,
      observed_at: normalizedInput.etf.observedAt,
      freshness: normalizedInput.etf.freshness,
      source: normalizedInput.etf.source,
      applied_weight: weights.etf ?? 0,
    });
  }

  reasons.push(
    {
      type: "permission",
      technical_permission: normalizedInput.technical.tradingPermission,
      funding_permission: normalizedInput.funding.tradingPermission,
      final_permission: tradingPermission,
      funding_block_policy:
        normalizedInput.funding.tradingPermission === "blocked"
          ? "caution_only"
          : "normal",
      safety_guard_applied: action !== ruleAction,
      rule_action: ruleAction,
      final_action: action,
    },
    {
      type: "weighting",
      technical_weight: weights.technical,
      news_weight: weights.news,
      funding_weight: weights.funding,
      etf_weight: weights.etf ?? 0,
      reason: weights.reason,
    },
  );

  return {
    finalScore: round2(finalScore),
    finalConfidence: round2(finalConfidence),
    direction,
    action,
    riskLevel: finalRisk,
    tradingPermission,
    alignment,
    weights,
    summary: buildDecisionSummary(
      action,
      finalScore,
      finalConfidence,
      alignment,
      finalRisk,
      technicalDirection,
      newsDirection,
      fundingDirection,
      etfDirection,
      normalizedInput.funding.fundingRatePercent,
      tradingPermission,
    ),
    reasons,
  };
}
