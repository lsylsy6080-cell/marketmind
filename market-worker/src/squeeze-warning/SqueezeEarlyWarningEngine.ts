import type {
  SqueezeEarlyWarningResult,
  SqueezeResponse,
  SqueezeWarningAssessment,
  SqueezeWarningPhase,
  SqueezeWarningSide,
} from "./types";

const clamp = (v: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, v));

const round = (v: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(v * scale) / scale;
};

export interface SqueezeHistoryPoint {
  probability: number;
  triggerPressure: number;
  liquidationConfirmation: number;
  nearestZoneIntensity: number;
  calculatedAt: string;
}

export interface WarningSideInput {
  side: SqueezeWarningSide;
  current: SqueezeHistoryPoint;
  history: SqueezeHistoryPoint[];
  previousPhase: SqueezeWarningPhase | null;
  liquidationState: string | null;
  liquidationConfidence: number | null;
}

export interface EarlyWarningInput {
  currentPrice: number;
  longSqueeze: Omit<WarningSideInput, "side">;
  shortSqueeze: Omit<WarningSideInput, "side">;
}

function expectedActiveState(side: SqueezeWarningSide): string {
  return side === "long_squeeze" ? "long_flush" : "short_squeeze";
}

function persistenceCount(history: SqueezeHistoryPoint[], threshold: number): number {
  let count = 0;
  const ordered = [...history].sort(
    (a, b) => new Date(b.calculatedAt).getTime() - new Date(a.calculatedAt).getTime(),
  );
  for (const point of ordered) {
    if (point.probability < threshold) break;
    count += 1;
  }
  return count;
}

function calculateMomentum(history: SqueezeHistoryPoint[]): number {
  if (history.length < 2) return 0;
  const ordered = [...history].sort(
    (a, b) => new Date(a.calculatedAt).getTime() - new Date(b.calculatedAt).getTime(),
  );
  const recent = ordered.slice(-5);
  const first = recent[0]?.probability ?? 0;
  const last = recent.at(-1)?.probability ?? first;
  const slope = last - first;

  const risingSteps = recent.slice(1).reduce((sum, point, index) => {
    return sum + (point.probability > recent[index].probability ? 1 : 0);
  }, 0);

  return round(clamp(Math.max(0, slope) * 2 + risingSteps * 10));
}

function chooseResponse(
  phase: SqueezeWarningPhase,
  side: SqueezeWarningSide,
): SqueezeResponse {
  switch (phase) {
    case "ACTIVE":
      return "defensive_exit";
    case "IMMINENT":
      return "reduce_opposite_exposure";
    case "BUILDING":
      return "tighten_risk";
    case "EXHAUSTION":
      return "wait_for_reset";
    case "WATCH":
    default:
      return "observe";
  }
}

function determinePhase(input: {
  probability: number;
  momentumScore: number;
  confirmationScore: number;
  zonePressureScore: number;
  persistence: number;
  previousPhase: SqueezeWarningPhase | null;
  actualLiquidationActive: boolean;
}): SqueezeWarningPhase {
  const {
    probability,
    momentumScore,
    confirmationScore,
    zonePressureScore,
    persistence,
    previousPhase,
    actualLiquidationActive,
  } = input;

  // Real liquidation confirmation has priority over model probability.
  if (
    actualLiquidationActive &&
    confirmationScore >= 55 &&
    (probability >= 55 || zonePressureScore >= 60)
  ) {
    return "ACTIVE";
  }

  // After ACTIVE/IMMINENT, a sharp collapse is treated as exhaustion
  // rather than instantly returning to WATCH.
  if (
    (previousPhase === "ACTIVE" || previousPhase === "IMMINENT") &&
    probability < 50 &&
    confirmationScore < 35
  ) {
    return "EXHAUSTION";
  }

  if (
    probability >= 72 &&
    zonePressureScore >= 55 &&
    (momentumScore >= 35 || persistence >= 2)
  ) {
    return "IMMINENT";
  }

  if (
    probability >= 52 &&
    zonePressureScore >= 35 &&
    (momentumScore >= 20 || persistence >= 2 || confirmationScore >= 35)
  ) {
    return "BUILDING";
  }

  // Hysteresis: BUILDING does not collapse on one weak sample.
  if (
    previousPhase === "BUILDING" &&
    probability >= 44 &&
    zonePressureScore >= 25
  ) {
    return "BUILDING";
  }

  // EXHAUSTION persists until risk has genuinely reset or starts rebuilding.
  if (
    previousPhase === "EXHAUSTION" &&
    probability >= 30 &&
    probability < 52
  ) {
    return "EXHAUSTION";
  }

  return "WATCH";
}

function assess(input: WarningSideInput): SqueezeWarningAssessment {
  const historyWithCurrent = [...input.history, input.current]
    .filter((point, index, rows) => {
      const ts = new Date(point.calculatedAt).getTime();
      return rows.findIndex((x) => new Date(x.calculatedAt).getTime() === ts) === index;
    })
    .sort((a, b) => new Date(a.calculatedAt).getTime() - new Date(b.calculatedAt).getTime());

  const previous = historyWithCurrent.length >= 2
    ? historyWithCurrent[historyWithCurrent.length - 2]
    : null;

  const probability = clamp(input.current.probability);
  const previousProbability = previous?.probability ?? null;
  const probabilityDelta =
    previousProbability == null ? null : round(probability - previousProbability);

  const persistence = persistenceCount(historyWithCurrent, 50);
  const momentumScore = calculateMomentum(historyWithCurrent);

  const confirmationScore = clamp(
    input.current.liquidationConfirmation * 0.7 +
      clamp(input.liquidationConfidence ?? 0) * 0.3,
  );

  const zonePressureScore = clamp(
    input.current.nearestZoneIntensity * 0.6 +
      input.current.triggerPressure * 0.4,
  );

  const actualLiquidationActive =
    (input.liquidationState ?? "").toLowerCase() === expectedActiveState(input.side);

  const phase = determinePhase({
    probability,
    momentumScore,
    confirmationScore,
    zonePressureScore,
    persistence,
    previousPhase: input.previousPhase,
    actualLiquidationActive,
  });

  const phaseBonus =
    phase === "ACTIVE" ? 20 :
    phase === "IMMINENT" ? 12 :
    phase === "BUILDING" ? 6 :
    phase === "EXHAUSTION" ? -8 : 0;

  const alertScore = round(clamp(
    probability * 0.48 +
      momentumScore * 0.17 +
      confirmationScore * 0.2 +
      zonePressureScore * 0.15 +
      phaseBonus,
  ));

  const reasons: string[] = [
    `${input.side} probability ${round(probability)} · zone pressure ${round(zonePressureScore)} · momentum ${round(momentumScore)}`,
    `청산 confirmation ${round(confirmationScore)} · 50+ 확률 연속 ${persistence}회`,
  ];

  if (probabilityDelta != null) {
    reasons.push(
      `직전 대비 확률 ${probabilityDelta >= 0 ? "+" : ""}${round(probabilityDelta)}%p`,
    );
  }

  if (actualLiquidationActive) {
    reasons.push(`실제 Liquidation 상태 ${input.liquidationState}가 방향을 확인했습니다.`);
  }

  if (phase === "EXHAUSTION") {
    reasons.push("이전 고위험 상태 이후 확률/청산 확인이 약화되어 EXHAUSTION으로 전환했습니다.");
  }

  return {
    side: input.side,
    phase,
    probability: round(probability),
    previousProbability: previousProbability == null ? null : round(previousProbability),
    probabilityDelta,
    persistenceCount: persistence,
    momentumScore,
    confirmationScore: round(confirmationScore),
    zonePressureScore: round(zonePressureScore),
    alertScore,
    recommendedResponse: chooseResponse(phase, input.side),
    reasons,
  };
}

export function calculateSqueezeEarlyWarning(
  input: EarlyWarningInput,
): SqueezeEarlyWarningResult {
  if (!Number.isFinite(input.currentPrice) || input.currentPrice <= 0) {
    throw new Error("currentPrice must be > 0");
  }

  const longSqueeze = assess({ ...input.longSqueeze, side: "long_squeeze" });
  const shortSqueeze = assess({ ...input.shortSqueeze, side: "short_squeeze" });
  const delta = longSqueeze.alertScore - shortSqueeze.alertScore;

  return {
    symbol: "BTCUSDT",
    calculatedAt: new Date().toISOString(),
    currentPrice: round(input.currentPrice),
    longSqueeze,
    shortSqueeze,
    dominantWarning:
      Math.abs(delta) < 8
        ? "balanced"
        : delta > 0
          ? "long_squeeze"
          : "short_squeeze",
    strategyVersion: "squeeze-early-warning-v7.15",
  };
}
