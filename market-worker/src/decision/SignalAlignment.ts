import { scoreToDirection } from "./DecisionScore";
import type { SignalAlignment } from "./types";

export function calculateSignalAlignment(
  scores: readonly number[],
): SignalAlignment {
  if (scores.length < 2) return "mixed";

  const directions = scores.map(scoreToDirection);

  const bullishCount = directions.filter(
    (value) => value === "bullish",
  ).length;

  const bearishCount = directions.filter(
    (value) => value === "bearish",
  ).length;

  const neutralCount = directions.filter(
    (value) => value === "neutral",
  ).length;

  const scoreSpread = Math.max(...scores) - Math.min(...scores);

  const majority = Math.floor(scores.length / 2) + 1;

  // 강한 상승
  if (
    bullishCount === scores.length &&
    scoreSpread <= 10
  ) {
    return "strong_alignment";
  }

  // 강한 하락
  if (
    bearishCount === scores.length &&
    scoreSpread <= 10
  ) {
    return "strong_alignment";
  }

  // 상승과 하락이 동시에 존재하면 다수결보다 충돌 판정을 우선합니다.
  // 강한 반대 신호가 섞인 상태를 단순 혼재로 낮춰 평가하지 않습니다.
  if (bullishCount > 0 && bearishCount > 0) {
    return "conflict";
  }

  // 상승 우세
  if (bullishCount >= majority) {
    if (neutralCount <= 1 && scoreSpread <= 18) {
      return "alignment";
    }

    return "mixed";
  }

  // 하락 우세
  if (bearishCount >= majority) {
    if (neutralCount <= 1 && scoreSpread <= 18) {
      return "alignment";
    }

    return "mixed";
  }

  return "mixed";
}
