export type StoredLevelTimeframe = "4h" | "1d" | "1w";
export type CurrentLevelTimeframe = "4h" | "1d";

export type TimeframeLevels = {
  timeframe: StoredLevelTimeframe;
  support: number | null;
  resistance: number | null;
};

export type CurrentReferenceLevels = {
  longTermSupport: number | null;
  longTermResistance: number | null;
  currentSupport: number | null;
  currentResistance: number | null;
  currentSupportSource: CurrentLevelTimeframe | null;
  currentResistanceSource: CurrentLevelTimeframe | null;
  supportDistancePct: number | null;
  resistanceDistancePct: number | null;
  rangeWidthPct: number | null;
  neutralRangeEligible: boolean;
  neutralRangeReason: string;
};

export type ScenarioState = "active" | "watch" | "invalidated";

export type ScenarioActivationPolicy = {
  bullish: { state: ScenarioState; reason: string };
  neutral: { state: ScenarioState; reason: string };
  bearish: { state: ScenarioState; reason: string };
};

export const CURRENT_LEVEL_MAX_DISTANCE_PCT = 8;
export const CURRENT_RANGE_MAX_WIDTH_PCT = 10;

function pctDistance(level: number | null, marketPrice: number): number | null {
  if (level == null || !Number.isFinite(level) || level <= 0 || marketPrice <= 0) return null;
  return ((level - marketPrice) / marketPrice) * 100;
}

function nearestSupport(
  marketPrice: number,
  items: TimeframeLevels[],
): { value: number; source: CurrentLevelTimeframe } | null {
  const candidates = items
    .filter((x) => x.timeframe !== "1w")
    .map((x) => ({ value: x.support, source: x.timeframe }))
    .filter(
      (x): x is { value: number; source: CurrentLevelTimeframe } =>
        x.value != null &&
        Number.isFinite(x.value) &&
        x.value > 0 &&
        x.value < marketPrice,
    )
    .map((x) => ({ ...x, distance: Math.abs(((x.value - marketPrice) / marketPrice) * 100) }))
    .filter((x) => x.distance <= CURRENT_LEVEL_MAX_DISTANCE_PCT)
    .sort((a, b) => a.distance - b.distance || (a.source === "4h" ? -1 : 1));

  return candidates[0] ? { value: candidates[0].value, source: candidates[0].source } : null;
}

function nearestResistance(
  marketPrice: number,
  items: TimeframeLevels[],
): { value: number; source: CurrentLevelTimeframe } | null {
  const candidates = items
    .filter((x) => x.timeframe !== "1w")
    .map((x) => ({ value: x.resistance, source: x.timeframe }))
    .filter(
      (x): x is { value: number; source: CurrentLevelTimeframe } =>
        x.value != null &&
        Number.isFinite(x.value) &&
        x.value > marketPrice,
    )
    .map((x) => ({ ...x, distance: Math.abs(((x.value - marketPrice) / marketPrice) * 100) }))
    .filter((x) => x.distance <= CURRENT_LEVEL_MAX_DISTANCE_PCT)
    .sort((a, b) => a.distance - b.distance || (a.source === "4h" ? -1 : 1));

  return candidates[0] ? { value: candidates[0].value, source: candidates[0].source } : null;
}

export function selectReferenceLevels(
  marketPrice: number,
  weekly: TimeframeLevels,
  daily: TimeframeLevels,
  fourHour: TimeframeLevels,
): CurrentReferenceLevels {
  const inputs = [fourHour, daily, weekly];
  const support = nearestSupport(marketPrice, inputs);
  const resistance = nearestResistance(marketPrice, inputs);

  const supportDistancePct = pctDistance(support?.value ?? null, marketPrice);
  const resistanceDistancePct = pctDistance(resistance?.value ?? null, marketPrice);
  const rangeWidthPct =
    support && resistance
      ? ((resistance.value - support.value) / marketPrice) * 100
      : null;

  const bothNear =
    supportDistancePct != null &&
    resistanceDistancePct != null &&
    Math.abs(supportDistancePct) <= CURRENT_LEVEL_MAX_DISTANCE_PCT &&
    Math.abs(resistanceDistancePct) <= CURRENT_LEVEL_MAX_DISTANCE_PCT;

  const narrowEnough =
    rangeWidthPct != null && rangeWidthPct > 0 && rangeWidthPct <= CURRENT_RANGE_MAX_WIDTH_PCT;

  const neutralRangeEligible = Boolean(
    support &&
      resistance &&
      support.value < marketPrice &&
      marketPrice < resistance.value &&
      bothNear &&
      narrowEnough,
  );

  let neutralRangeReason = "현재가 주변의 유효한 지지·저항 구간이 충분하지 않음";
  if (support && resistance && !narrowEnough) {
    neutralRangeReason = `현재 지지·저항 범위가 ${rangeWidthPct?.toFixed(2)}%로 너무 넓어 횡보 활성 조건에서 제외`;
  } else if (neutralRangeEligible) {
    neutralRangeReason = `현재가 주변 ${rangeWidthPct?.toFixed(2)}% 범위의 유효한 지지·저항 구간 확인`;
  } else if (!support) {
    neutralRangeReason = `현재가 ${CURRENT_LEVEL_MAX_DISTANCE_PCT}% 이내의 유효 지지를 찾지 못함`;
  } else if (!resistance) {
    neutralRangeReason = `현재가 ${CURRENT_LEVEL_MAX_DISTANCE_PCT}% 이내의 유효 저항을 찾지 못함`;
  }

  // V1 reference_support/resistance가 일봉 기준이었으므로 장기 레벨은 일봉을 우선 보존합니다.
  const longTermSupport = daily.support ?? weekly.support;
  const longTermResistance = daily.resistance ?? weekly.resistance;

  return {
    longTermSupport,
    longTermResistance,
    currentSupport: support?.value ?? null,
    currentResistance: resistance?.value ?? null,
    currentSupportSource: support?.source ?? null,
    currentResistanceSource: resistance?.source ?? null,
    supportDistancePct,
    resistanceDistancePct,
    rangeWidthPct,
    neutralRangeEligible,
    neutralRangeReason,
  };
}

export function decideScenarioActivation(input: {
  neutralRangeEligible: boolean;
  neutralRangeReason: string;
  bullishBreakoutConfirmed: boolean;
  bearishBreakdownConfirmed: boolean;
}): ScenarioActivationPolicy {
  if (input.bullishBreakoutConfirmed && !input.bearishBreakdownConfirmed) {
    return {
      bullish: { state: "active", reason: "최근 일봉/4H Major 상승 구조 돌파와 거래량 확인" },
      neutral: { state: "invalidated", reason: "상승 구조 돌파 확인으로 횡보 시나리오 약화" },
      bearish: { state: "watch", reason: "핵심 지지 이탈 전까지 하락 전환은 관찰" },
    };
  }

  if (input.bearishBreakdownConfirmed && !input.bullishBreakoutConfirmed) {
    return {
      bullish: { state: "watch", reason: "상승 회복 구조가 다시 확인될 때까지 관찰" },
      neutral: { state: "invalidated", reason: "하락 구조 이탈 확인으로 횡보 시나리오 약화" },
      bearish: { state: "active", reason: "최근 일봉/4H Major 하락 구조 이탈과 거래량 확인" },
    };
  }

  if (input.bullishBreakoutConfirmed && input.bearishBreakdownConfirmed) {
    return {
      bullish: { state: "watch", reason: "상·하방 구조 신호가 동시에 존재하여 확정 보류" },
      neutral: { state: "watch", reason: "구조 신호 충돌로 방향 확인 대기" },
      bearish: { state: "watch", reason: "상·하방 구조 신호가 동시에 존재하여 확정 보류" },
    };
  }

  if (input.neutralRangeEligible) {
    return {
      bullish: { state: "watch", reason: "근거리 저항 돌파 + 거래량 확인 대기" },
      neutral: { state: "active", reason: input.neutralRangeReason },
      bearish: { state: "watch", reason: "근거리 지지 이탈 + 하락 구조 확인 대기" },
    };
  }

  return {
    bullish: { state: "watch", reason: "상승 구조 돌파 + 거래량 확인 대기" },
    neutral: { state: "watch", reason: input.neutralRangeReason },
    bearish: { state: "watch", reason: "하락 구조 이탈 + 거래량 확인 대기" },
  };
}
