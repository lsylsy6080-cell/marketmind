import {
  analyzeLongTermTrend,
  combineLongTermTrends,
  type TrendScenario,
  type TrendSummary,
} from "./engine";
import {
  findSnapshotId,
  getLatestSpotPrice,
  insertSnapshot,
  lastStructureEvent,
  loadTrendCandles,
} from "./repository";
import { decideScenarioActivation, selectReferenceLevels } from "./level-policy";

export const LONG_TERM_TREND_ENGINE_VERSION = "long-term-trend-engine-v3.1-level-policy";

const MIN_CANDLES = 80;

export type LongTermTrendSnapshotResult =
  | {
      status: "skipped";
      reason: "already_saved";
      snapshotHour: string;
      existingId: number;
    }
  | {
      status: "saved";
      snapshotHour: string;
      id: number;
      marketPrice: number;
      combinedScore: number;
      combinedLabel: string;
      confidence: number;
      risk: number;
      currentSupport: number | null;
      currentResistance: number | null;
      neutralScenarioState: TrendScenario["state"];
    };

type CombinedScenario = {
  kind: TrendScenario["kind"];
  label: string;
  strength: number;
  state: TrendScenario["state"];
  reason?: string;
};

function hourBucket(date = new Date()): string {
  const ms = Math.floor(date.getTime() / 3_600_000) * 3_600_000;
  return new Date(ms).toISOString();
}

function scenarioFor(summary: TrendSummary, kind: TrendScenario["kind"]): TrendScenario {
  const scenario = summary.scenarios.find((item) => item.kind === kind);
  if (!scenario) {
    throw new Error(`[long-term-trend] ${kind} 시나리오가 없습니다.`);
  }
  return scenario;
}

function combinedScenario(
  kind: TrendScenario["kind"],
  weekly: TrendSummary,
  daily: TrendSummary,
  fourHour: TrendSummary,
): CombinedScenario {
  const items = [
    { scenario: scenarioFor(weekly, kind), weight: 0.4 },
    { scenario: scenarioFor(daily, kind), weight: 0.4 },
    { scenario: scenarioFor(fourHour, kind), weight: 0.2 },
  ];

  const strength = Math.round(
    items.reduce((sum, item) => sum + item.scenario.strength * item.weight, 0),
  );
  const activeWeight = items
    .filter((item) => item.scenario.state === "active")
    .reduce((sum, item) => sum + item.weight, 0);
  const invalidatedWeight = items
    .filter((item) => item.scenario.state === "invalidated")
    .reduce((sum, item) => sum + item.weight, 0);

  const state: TrendScenario["state"] =
    activeWeight >= 0.4
      ? "active"
      : invalidatedWeight >= 0.6
        ? "invalidated"
        : "watch";

  const label =
    kind === "bullish"
      ? "상승 지속"
      : kind === "neutral"
        ? "횡보 / 조정"
        : "하락 전환";

  return { kind, label, strength, state };
}

function normalizeCombinedScenarios(
  bullish: CombinedScenario,
  neutral: CombinedScenario,
  bearish: CombinedScenario,
): [CombinedScenario, CombinedScenario, CombinedScenario] {
  const rawTotal = bullish.strength + neutral.strength + bearish.strength;
  if (rawTotal <= 0) return [bullish, neutral, bearish];

  const normalizedBull = Math.round((bullish.strength / rawTotal) * 100);
  const normalizedNeutral = Math.round((neutral.strength / rawTotal) * 100);
  const normalizedBear = 100 - normalizedBull - normalizedNeutral;

  return [
    { ...bullish, strength: normalizedBull },
    { ...neutral, strength: normalizedNeutral },
    { ...bearish, strength: normalizedBear },
  ];
}

function structureBreakoutConfirmed(
  summary: TrendSummary,
  direction: "bullish" | "bearish",
  maxAgeBars: number,
): boolean {
  const event = summary.events.at(-1);
  if (!event || event.direction !== direction) return false;
  if (summary.latestStructureAgeBars == null || summary.latestStructureAgeBars > maxAgeBars) return false;
  return summary.volumeConfirmation.includes("돌파 확인");
}

function assertEnoughCandles(label: string, count: number): void {
  if (count < MIN_CANDLES) {
    throw new Error(
      `[long-term-trend] ${label} 캔들이 ${count}개뿐입니다. 최소 ${MIN_CANDLES}개가 필요합니다.`,
    );
  }
}

export async function runLongTermTrendSnapshot(options?: {
  force?: boolean;
  now?: Date;
}): Promise<LongTermTrendSnapshotResult> {
  const now = options?.now ?? new Date();
  const snapshotHour = hourBucket(now);

  if (!options?.force) {
    const existingId = await findSnapshotId(
      LONG_TERM_TREND_ENGINE_VERSION,
      snapshotHour,
    );
    if (existingId != null) {
      return {
        status: "skipped",
        reason: "already_saved",
        snapshotHour,
        existingId,
      };
    }
  }

  const [weeklyCandles, dailyCandles, fourHourCandles, marketPrice] =
    await Promise.all([
      loadTrendCandles("1w", 700),
      loadTrendCandles("1d", 1800),
      loadTrendCandles("4h", 1600),
      getLatestSpotPrice(),
    ]);

  assertEnoughCandles("주봉", weeklyCandles.length);
  assertEnoughCandles("일봉", dailyCandles.length);
  assertEnoughCandles("4시간봉", fourHourCandles.length);

  const weekly = analyzeLongTermTrend(weeklyCandles, "1w");
  const daily = analyzeLongTermTrend(dailyCandles, "1d");
  const fourHour = analyzeLongTermTrend(fourHourCandles, "4h");
  const combined = combineLongTermTrends(weekly, daily, fourHour);

  if (!combined) {
    throw new Error("[long-term-trend] 장기 종합 추세 계산 결과가 없습니다.");
  }

  let [bullishScenario, neutralScenario, bearishScenario] =
    normalizeCombinedScenarios(
      combinedScenario("bullish", weekly, daily, fourHour),
      combinedScenario("neutral", weekly, daily, fourHour),
      combinedScenario("bearish", weekly, daily, fourHour),
    );

  const referenceLevels = selectReferenceLevels(
    marketPrice,
    { timeframe: "1w", support: weekly.support, resistance: weekly.resistance },
    { timeframe: "1d", support: daily.support, resistance: daily.resistance },
    { timeframe: "4h", support: fourHour.support, resistance: fourHour.resistance },
  );

  const bullishBreakoutConfirmed =
    structureBreakoutConfirmed(daily, "bullish", 20) ||
    structureBreakoutConfirmed(fourHour, "bullish", 42);
  const bearishBreakdownConfirmed =
    structureBreakoutConfirmed(daily, "bearish", 20) ||
    structureBreakoutConfirmed(fourHour, "bearish", 42);

  const scenarioPolicy = decideScenarioActivation({
    neutralRangeEligible: referenceLevels.neutralRangeEligible,
    neutralRangeReason: referenceLevels.neutralRangeReason,
    bullishBreakoutConfirmed,
    bearishBreakdownConfirmed,
  });

  bullishScenario = { ...bullishScenario, ...scenarioPolicy.bullish };
  neutralScenario = { ...neutralScenario, ...scenarioPolicy.neutral };
  bearishScenario = { ...bearishScenario, ...scenarioPolicy.bearish };

  const snapshotPayload = {
    engineVersion: LONG_TERM_TREND_ENGINE_VERSION,
    weights: {
      weekly: 0.4,
      daily: 0.4,
      fourHour: 0.2,
    },
    combined,
    weekly,
    daily,
    fourHour,
    combinedScenarios: [
      bullishScenario,
      neutralScenario,
      bearishScenario,
    ],
    referenceLevels,
    scenarioPolicy: {
      bullishBreakoutConfirmed,
      bearishBreakdownConfirmed,
      ...scenarioPolicy,
    },
    candleCounts: {
      weekly: weeklyCandles.length,
      daily: dailyCandles.length,
      fourHour: fourHourCandles.length,
    },
    capturedAt: now.toISOString(),
  };

  const id = await insertSnapshot({
    exchange: "binance",
    market_type: "spot",
    symbol: "BTCUSDT",
    engine_version: LONG_TERM_TREND_ENGINE_VERSION,
    snapshot_hour: snapshotHour,
    market_price: marketPrice,
    weekly_score: weekly.score,
    daily_score: daily.score,
    four_hour_score: fourHour.score,
    combined_score: combined.score,
    combined_label: combined.label,
    combined_confidence: combined.confidence,
    combined_risk: combined.risk,
    trend_continuation: combined.continuation,
    reversal_risk: combined.reversal,
    weekly_label: weekly.label,
    daily_label: daily.label,
    four_hour_label: fourHour.label,
    weekly_structure: weekly.structure,
    daily_structure: daily.structure,
    four_hour_structure: fourHour.structure,
    weekly_data_quality: weekly.dataQuality,
    daily_data_quality: daily.dataQuality,
    four_hour_data_quality: fourHour.dataQuality,
    reference_timeframe: referenceLevels.currentSupportSource ?? referenceLevels.currentResistanceSource ?? "1d",
    reference_support: referenceLevels.currentSupport,
    reference_resistance: referenceLevels.currentResistance,
    long_term_support: referenceLevels.longTermSupport,
    long_term_resistance: referenceLevels.longTermResistance,
    current_support: referenceLevels.currentSupport,
    current_resistance: referenceLevels.currentResistance,
    current_support_source: referenceLevels.currentSupportSource,
    current_resistance_source: referenceLevels.currentResistanceSource,
    current_support_distance_pct: referenceLevels.supportDistancePct,
    current_resistance_distance_pct: referenceLevels.resistanceDistancePct,
    current_range_width_pct: referenceLevels.rangeWidthPct,
    neutral_range_eligible: referenceLevels.neutralRangeEligible,
    scenario_activation_reason: {
      bullish: scenarioPolicy.bullish.reason,
      neutral: scenarioPolicy.neutral.reason,
      bearish: scenarioPolicy.bearish.reason,
      bullishBreakoutConfirmed,
      bearishBreakdownConfirmed,
    },
    bullish_scenario_strength: bullishScenario.strength,
    neutral_scenario_strength: neutralScenario.strength,
    bearish_scenario_strength: bearishScenario.strength,
    bullish_scenario_state: bullishScenario.state,
    neutral_scenario_state: neutralScenario.state,
    bearish_scenario_state: bearishScenario.state,
    weekly_structure_event: lastStructureEvent(weekly),
    daily_structure_event: lastStructureEvent(daily),
    four_hour_structure_event: lastStructureEvent(fourHour),
    scenario_summary: {
      bullish: bullishScenario,
      neutral: neutralScenario,
      bearish: bearishScenario,
    },
    snapshot_payload: snapshotPayload,
  });

  return {
    status: "saved",
    snapshotHour,
    id,
    marketPrice,
    combinedScore: combined.score,
    combinedLabel: combined.label,
    confidence: combined.confidence,
    risk: combined.risk,
    currentSupport: referenceLevels.currentSupport,
    currentResistance: referenceLevels.currentResistance,
    neutralScenarioState: neutralScenario.state,
  };
}
