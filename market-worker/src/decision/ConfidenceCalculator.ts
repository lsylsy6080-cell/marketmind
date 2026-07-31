import { clamp } from "./DecisionScore";
import type {
  DecisionEngineInput,
  DecisionWeights,
  SignalAlignment,
} from "./types";

const ALIGNMENT_BONUS: Record<SignalAlignment, number> = {
  strong_alignment: 10,
  alignment: 5,
  mixed: -4,
  conflict: -15,
};

function normalize(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 1;
  }

  return clamp(value, 0, 1);
}

function calculateRiskPenalty(input: DecisionEngineInput): number {
  let penalty = 0;

  const risks = [
    input.technical.riskLevel,
    input.news.riskLevel,
    input.funding.riskLevel,
    input.etf?.riskLevel,
  ];

  for (const risk of risks) {
    switch (risk) {
      case "critical":
        penalty += 12;
        break;

      case "high":
        penalty += 6;
        break;

      case "normal":
        penalty += 2;
        break;

      default:
        break;
    }
  }

  return penalty;
}

function calculateAgreementBonus(input: DecisionEngineInput): number {
  const directions = [
    input.technical.direction,
    input.news.direction,
    input.funding.direction,
    input.etf?.direction,
  ].filter(Boolean);

  if (directions.length <= 1) {
    return 0;
  }

  const bullish = directions.filter(v => v === "bullish").length;
  const bearish = directions.filter(v => v === "bearish").length;
  const neutral = directions.filter(v => v === "neutral").length;

  const max = Math.max(bullish, bearish, neutral);

  if (max === directions.length) {
    return 6;
  }

  if (max >= directions.length - 1) {
    return 3;
  }

  return -3;
}

export function calculateFinalConfidence(
  input: DecisionEngineInput,
  weights: DecisionWeights,
  alignment: SignalAlignment,
): number {

  const etfWeight =
    input.etf
      ? (weights.etf ?? 0)
      : 0;

  const weightedConfidence =
      input.technical.confidence * weights.technical +
      input.news.confidence * weights.news +
      input.funding.confidence * weights.funding +
      (input.etf?.confidence ?? 0) * etfWeight;

  const conflictPenalty =
      input.news.conflictScore * 0.10;

  const freshness =
      normalize(input.etf?.freshness);

  const freshnessPenalty =
      input.etf
      ? (1 - freshness) * etfWeight * 20
      : 0;

  const riskPenalty =
      calculateRiskPenalty(input);

  const agreementBonus =
      calculateAgreementBonus(input);

  let confidence =
      weightedConfidence +
      ALIGNMENT_BONUS[alignment] +
      agreementBonus -
      conflictPenalty -
      freshnessPenalty -
      riskPenalty;

  //
  // 매우 높은 신뢰도는 쉽게 나오지 않도록 완만하게 압축
  //
  if (confidence > 90) {
    confidence = 90 + (confidence - 90) * 0.4;
  }

  return clamp(confidence, 0, 100);
}