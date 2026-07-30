import type { EtfFlowRecord } from "./types";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const sumRecentFlows = (
  records: EtfFlowRecord[],
  count: number,
): number | null => {
  if (records.length < count) {
    return null;
  }

  return records
    .slice(-count)
    .reduce((sum, record) => sum + record.totalFlowUsd, 0);
};

function calculateStreak(records: EtfFlowRecord[]) {
  let positiveStreak = 0;
  let negativeStreak = 0;

  for (let index = records.length - 1; index >= 0; index -= 1) {
    const flow = records[index].totalFlowUsd;

    if (flow > 0) {
      if (negativeStreak > 0) {
        break;
      }

      positiveStreak += 1;
      continue;
    }

    if (flow < 0) {
      if (positiveStreak > 0) {
        break;
      }

      negativeStreak += 1;
      continue;
    }

    // 0인 날짜는 연속 흐름을 끊는 것으로 처리
    break;
  }

  return {
    positiveStreak,
    negativeStreak,
  };
}

function normalizeComponent(
  value: number | null,
  referenceAmount: number,
  maximumScore: number,
): number {
  if (value === null) {
    return 0;
  }

  return (
    clamp(value / referenceAmount, -1, 1) *
    maximumScore
  );
}

function createSummary(
  score: number,
  dailyFlowUsd: number,
  flow5dUsd: number | null,
  flow20dUsd: number | null,
  positiveStreak: number,
  negativeStreak: number,
): string {
  const dailyDirection =
    dailyFlowUsd > 0
      ? "순유입"
      : dailyFlowUsd < 0
        ? "순유출"
        : "보합";

  const trendDirection =
    flow20dUsd === null
      ? "장기 데이터 확인 중"
      : flow20dUsd > 0
        ? "중기 순유입 우세"
        : flow20dUsd < 0
          ? "중기 순유출 우세"
          : "중기 흐름 중립";

  const streakText =
    positiveStreak >= 2
      ? `${positiveStreak}거래일 연속 순유입`
      : negativeStreak >= 2
        ? `${negativeStreak}거래일 연속 순유출`
        : "뚜렷한 연속 흐름 없음";

  const directionText =
    score >= 70
      ? "강한 강세"
      : score >= 60
        ? "강세"
        : score <= 30
          ? "강한 약세"
          : score <= 40
            ? "약세"
            : "중립";

  const fiveDayText =
    flow5dUsd === null
      ? "5일 데이터 부족"
      : `5일 누적 ${flow5dUsd >= 0 ? "순유입" : "순유출"}`;

  return `${directionText}: 당일 ${dailyDirection}, ${fiveDayText}, ${trendDirection}, ${streakText}.`;
}

export function calculateEtfScore(
  currentRecord: EtfFlowRecord,
  history: EtfFlowRecord[],
) {
  /*
   * currentRecord까지 포함한 뒤 날짜순으로 정렬한다.
   * 같은 날짜가 중복 전달되어도 마지막 한 건만 유지한다.
   */
  const recordMap = new Map<string, EtfFlowRecord>();

  for (const record of [...history, currentRecord]) {
    recordMap.set(record.flowDate, record);
  }

  const records = [...recordMap.values()].sort((a, b) =>
    a.flowDate.localeCompare(b.flowDate),
  );

  const currentIndex = records.findIndex(
    (record) => record.flowDate === currentRecord.flowDate,
  );

  if (currentIndex === -1) {
    throw new Error(
      `ETF 점수 계산 대상 날짜를 찾지 못했습니다: ${currentRecord.flowDate}`,
    );
  }

  /*
   * 미래 날짜가 점수 계산에 섞이지 않도록
   * 현재 날짜까지의 데이터만 사용한다.
   */
  const availableRecords = records.slice(0, currentIndex + 1);

  const dailyFlowUsd = currentRecord.totalFlowUsd;
  const flow3dUsd = sumRecentFlows(availableRecords, 3);
  const flow5dUsd = sumRecentFlows(availableRecords, 5);
  const flow20dUsd = sumRecentFlows(availableRecords, 20);

  const { positiveStreak, negativeStreak } =
    calculateStreak(availableRecords);

  /*
   * 기준 금액을 넘으면 해당 항목의 최대 점수에 도달한다.
   *
   * 일일  : ±5억 달러  → ±15점
   * 3일   : ±10억 달러 → ±10점
   * 5일   : ±15억 달러 → ±10점
   * 20일  : ±40억 달러 → ±10점
   */
  const dailyComponent = normalizeComponent(
    dailyFlowUsd,
    500_000_000,
    15,
  );

  const flow3dComponent = normalizeComponent(
    flow3dUsd,
    1_000_000_000,
    10,
  );

  const flow5dComponent = normalizeComponent(
    flow5dUsd,
    1_500_000_000,
    10,
  );

  const flow20dComponent = normalizeComponent(
    flow20dUsd,
    4_000_000_000,
    10,
  );

  const streakValue =
    positiveStreak > 0
      ? Math.min(positiveStreak, 5)
      : negativeStreak > 0
        ? -Math.min(negativeStreak, 5)
        : 0;

  const streakComponent = streakValue;

  const rawScore =
    50 +
    dailyComponent +
    flow3dComponent +
    flow5dComponent +
    flow20dComponent +
    streakComponent;

  const score = Math.round(clamp(rawScore, 0, 100));

  const direction =
    score >= 60
      ? "bullish"
      : score <= 40
        ? "bearish"
        : "neutral";

  /*
   * 데이터 기간과 개별 ETF 상세 수에 따라 신뢰도를 계산한다.
   * 최소 45점, 최대 95점.
   */
  const historyConfidence =
    Math.min(availableRecords.length, 20) / 20 * 35;

  const detailConfidence =
    Math.min(currentRecord.details.length, 11) / 11 * 15;

  const confidence = Math.round(
    clamp(45 + historyConfidence + detailConfidence, 45, 95),
  );

  return {
    asset: currentRecord.asset,
    flow_date: currentRecord.flowDate,

    daily_flow_usd: dailyFlowUsd,
    flow_3d_usd: flow3dUsd,
    flow_5d_usd: flow5dUsd,
    flow_20d_usd: flow20dUsd,

    positive_streak: positiveStreak,
    negative_streak: negativeStreak,

    score,
    confidence,
    direction,

    summary: createSummary(
      score,
      dailyFlowUsd,
      flow5dUsd,
      flow20dUsd,
      positiveStreak,
      negativeStreak,
    ),

    score_details: {
      daily_component: Number(dailyComponent.toFixed(2)),
      flow_3d_component: Number(flow3dComponent.toFixed(2)),
      flow_5d_component: Number(flow5dComponent.toFixed(2)),
      flow_20d_component: Number(flow20dComponent.toFixed(2)),
      streak_component: Number(streakComponent.toFixed(2)),

      available_history_days: availableRecords.length,
      detail_count: currentRecord.details.length,

      reference_amounts_usd: {
        daily: 500_000_000,
        flow_3d: 1_000_000_000,
        flow_5d: 1_500_000_000,
        flow_20d: 4_000_000_000,
      },

      scoring_version: "etf-v2",
    },

    calculated_at: new Date().toISOString(),
  };
}