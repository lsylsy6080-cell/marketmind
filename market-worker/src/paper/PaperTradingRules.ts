export type PositionSide = "long" | "short";

export type CloseReason =
  | "take_profit"
  | "stop_loss"
  | "break_even"
  | "trailing_profit"
  | "max_holding"
  | "opposite_signal";

export type DecisionDirection = "bullish" | "neutral" | "bearish";
export type DecisionAction = "strong_buy" | "buy" | "wait" | "reduce" | "sell";
export type TradingPermission = "allowed" | "caution" | "blocked";

export interface PaperStrategyConfig {
  symbol: string;
  longScoreMin: number;
  shortScoreMax: number;
  confidenceMin: number;
  maxHoldingMinutes: number;
  allowLong: boolean;
  allowShort: boolean;
}

export interface PaperDecision {
  decidedAt: string;
  finalScore: number;
  finalConfidence: number;
  direction: DecisionDirection;
  action: DecisionAction;
  tradingPermission: TradingPermission;
}

export interface PaperPosition {
  side: PositionSide;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  openedAt: string;
}

export interface PositionExcursion {
  mfePercent: number;
  maePercent: number;
}

export interface ProtectionThresholds {
  targetReturnPercent: number;
  breakEvenActivationPercent: number;
  breakEvenFloorPercent: number;
  trailingActivationPercent: number;
  trailingGivebackPercent: number;
}

export interface EntryEligibility {
  allowed: boolean;
  reason: string;
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} 값이 올바르지 않습니다.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function elapsedMinutes(
  timestamp: string,
  nowMs = Date.now(),
): number {
  const time = new Date(timestamp).getTime();

  if (!Number.isFinite(time)) {
    throw new Error(`시간 값이 올바르지 않습니다: ${timestamp}`);
  }

  assertFinite(nowMs, "현재 시간");
  return Math.max(0, (nowMs - time) / 60_000);
}

export function validateStrategyConfig(config: PaperStrategyConfig): void {
  const values: Array<[number, string]> = [
    [config.longScoreMin, "LONG 기준 점수"],
    [config.shortScoreMax, "SHORT 기준 점수"],
    [config.confidenceMin, "최소 신뢰도"],
    [config.maxHoldingMinutes, "최대 보유 시간"],
  ];

  for (const [value, label] of values) {
    assertFinite(value, label);
  }

  if (!/^[A-Z0-9]{5,20}$/.test(config.symbol)) {
    throw new Error(`거래 심볼 형식이 올바르지 않습니다: ${config.symbol}`);
  }

  if (
    config.longScoreMin < 0 ||
    config.longScoreMin > 100 ||
    config.shortScoreMax < 0 ||
    config.shortScoreMax > 100 ||
    config.confidenceMin < 0 ||
    config.confidenceMin > 100
  ) {
    throw new Error("전략 점수와 신뢰도 기준은 0~100 범위여야 합니다.");
  }

  if (config.shortScoreMax >= config.longScoreMin) {
    throw new Error("SHORT 기준 점수는 LONG 기준 점수보다 낮아야 합니다.");
  }

  if (config.maxHoldingMinutes <= 0) {
    throw new Error("최대 보유 시간은 0분보다 커야 합니다.");
  }

  if (!config.allowLong && !config.allowShort) {
    throw new Error("LONG 또는 SHORT 중 하나 이상을 허용해야 합니다.");
  }
}

export function evaluateEntryEligibility(
  config: PaperStrategyConfig,
  decision: PaperDecision | null,
  decisionMaxAgeMinutes: number,
  nowMs = Date.now(),
): EntryEligibility {
  validateStrategyConfig(config);

  assertFinite(decisionMaxAgeMinutes, "판단 유효 시간");
  if (decisionMaxAgeMinutes <= 0) {
    throw new Error("판단 유효 시간은 0분보다 커야 합니다.");
  }

  if (!decision) {
    return {
      allowed: false,
      reason: "Final Market AI 판단 데이터가 없습니다.",
    };
  }

  if (elapsedMinutes(decision.decidedAt, nowMs) > decisionMaxAgeMinutes) {
    return {
      allowed: false,
      reason: `최신 판단이 ${decisionMaxAgeMinutes}분보다 오래되어 진입하지 않았습니다.`,
    };
  }

  if (decision.tradingPermission === "blocked") {
    return {
      allowed: false,
      reason: "Final Market AI가 거래를 차단하여 진입하지 않았습니다.",
    };
  }

  if (decision.finalConfidence < config.confidenceMin) {
    return {
      allowed: false,
      reason: "최종 신뢰도가 전략의 최소 신뢰도보다 낮습니다.",
    };
  }

  const longSignal =
    decision.direction === "bullish" &&
    (decision.action === "strong_buy" || decision.action === "buy") &&
    decision.finalScore >= config.longScoreMin;

  if (longSignal) {
    return config.allowLong
      ? { allowed: true, reason: "LONG 진입 조건을 충족했습니다." }
      : { allowed: false, reason: "전략 설정에서 LONG 진입이 비활성화되어 있습니다." };
  }

  const shortSignal =
    decision.direction === "bearish" &&
    (decision.action === "reduce" || decision.action === "sell") &&
    decision.finalScore <= config.shortScoreMax;

  if (shortSignal) {
    return config.allowShort
      ? { allowed: true, reason: "SHORT 진입 조건을 충족했습니다." }
      : { allowed: false, reason: "전략 설정에서 SHORT 진입이 비활성화되어 있습니다." };
  }

  return {
    allowed: false,
    reason: "현재 판단이 전략의 LONG·SHORT 진입 조건을 충족하지 않았습니다.",
  };
}

export function calculatePositionReturnPercent(
  position: PaperPosition,
  marketPrice: number,
): number {
  assertFinite(marketPrice, "시장 가격");
  if (marketPrice <= 0 || position.entryPrice <= 0) {
    throw new Error("시장 가격과 진입 가격은 0보다 커야 합니다.");
  }

  return position.side === "long"
    ? ((marketPrice / position.entryPrice) - 1) * 100
    : ((position.entryPrice / marketPrice) - 1) * 100;
}

export function updatePositionExcursion(
  previous: PositionExcursion,
  currentReturnPercent: number,
): PositionExcursion {
  assertFinite(previous.mfePercent, "MFE");
  assertFinite(previous.maePercent, "MAE");
  assertFinite(currentReturnPercent, "현재 수익률");

  return {
    mfePercent: Math.max(0, previous.mfePercent, currentReturnPercent),
    maePercent: Math.min(0, previous.maePercent, currentReturnPercent),
  };
}

export function deriveProtectionThresholds(
  position: PaperPosition,
): ProtectionThresholds {
  const targetReturnPercent = Math.abs(
    calculatePositionReturnPercent(position, position.takeProfitPrice),
  );

  // Phase 6-2B: 전략별 기존 TP 폭을 기준으로 보호 청산 임계값을 자동 산출합니다.
  // 약 3% TP 전략이라면 BE≈0.6%, Trail≈1.05%, Giveback≈0.45% 수준입니다.
  return {
    targetReturnPercent,
    breakEvenActivationPercent: clamp(targetReturnPercent * 0.2, 0.35, 0.75),
    breakEvenFloorPercent: 0.05,
    trailingActivationPercent: clamp(targetReturnPercent * 0.35, 0.6, 1.5),
    trailingGivebackPercent: clamp(targetReturnPercent * 0.15, 0.25, 0.75),
  };
}

export function determineCloseReason(
  position: PaperPosition,
  config: PaperStrategyConfig,
  decision: PaperDecision | null,
  marketPrice: number,
  decisionMaxAgeMinutes: number,
  nowMs = Date.now(),
  excursion: PositionExcursion | null = null,
): CloseReason | null {
  validateStrategyConfig(config);
  assertFinite(marketPrice, "시장 가격");
  assertFinite(decisionMaxAgeMinutes, "판단 유효 시간");

  if (marketPrice <= 0) {
    throw new Error("시장 가격은 0보다 커야 합니다.");
  }

  if (decisionMaxAgeMinutes <= 0) {
    throw new Error("판단 유효 시간은 0분보다 커야 합니다.");
  }

  if (position.side === "long") {
    if (marketPrice <= position.stopLossPrice) return "stop_loss";
    if (marketPrice >= position.takeProfitPrice) return "take_profit";
  } else {
    if (marketPrice >= position.stopLossPrice) return "stop_loss";
    if (marketPrice <= position.takeProfitPrice) return "take_profit";
  }

  // Phase 6-2B: Hard SL/TP를 침범하지 않는 보호 청산.
  // MFE가 충분히 쌓인 뒤 수익을 크게 반납하면 trailing_profit,
  // 그보다 작은 선행 수익을 모두 반납하면 break_even으로 종료합니다.
  if (excursion) {
    const currentReturnPercent = calculatePositionReturnPercent(
      position,
      marketPrice,
    );
    const thresholds = deriveProtectionThresholds(position);

    if (
      excursion.mfePercent >= thresholds.trailingActivationPercent &&
      currentReturnPercent <=
        excursion.mfePercent - thresholds.trailingGivebackPercent
    ) {
      return "trailing_profit";
    }

    if (
      excursion.mfePercent >= thresholds.breakEvenActivationPercent &&
      currentReturnPercent <= thresholds.breakEvenFloorPercent
    ) {
      return "break_even";
    }
  }

  // Phase 6-2: 가격 기반 SL/TP와 보호 청산 다음에는 유효한 반대 신호를 평가합니다.
  const decisionIsUsable =
    decision !== null &&
    elapsedMinutes(decision.decidedAt, nowMs) <= decisionMaxAgeMinutes &&
    decision.tradingPermission !== "blocked" &&
    decision.finalConfidence >= config.confidenceMin;

  if (decisionIsUsable && decision) {
    if (
      position.side === "long" &&
      decision.direction === "bearish" &&
      decision.action === "sell" &&
      decision.finalScore <= config.shortScoreMax
    ) {
      return "opposite_signal";
    }

    if (
      position.side === "short" &&
      decision.direction === "bullish" &&
      (decision.action === "strong_buy" || decision.action === "buy") &&
      decision.finalScore >= config.longScoreMin
    ) {
      return "opposite_signal";
    }
  }

  if (elapsedMinutes(position.openedAt, nowMs) >= config.maxHoldingMinutes) {
    return "max_holding";
  }

  return null;
}

export function calculateUnrealizedPnl(
  position: PaperPosition,
  marketPrice: number,
): number {
  assertFinite(marketPrice, "시장 가격");

  if (marketPrice <= 0 || position.entryPrice <= 0 || position.quantity <= 0) {
    throw new Error("시장 가격, 진입 가격, 수량은 모두 0보다 커야 합니다.");
  }

  return position.side === "long"
    ? (marketPrice - position.entryPrice) * position.quantity
    : (position.entryPrice - marketPrice) * position.quantity;
}
