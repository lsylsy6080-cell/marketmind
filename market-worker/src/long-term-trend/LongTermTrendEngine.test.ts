import {
  analyzeLongTermTrend,
  combineLongTermTrends,
  type TrendCandle,
} from "./engine";
import { decideScenarioActivation, selectReferenceLevels } from "./level-policy";



function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function makeTrend(direction: "up" | "down", count = 360): TrendCandle[] {
  const start = 60_000;
  const step = direction === "up" ? 95 : -95;
  const out: TrendCandle[] = [];

  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin(i / 8) * 420 + Math.sin(i / 23) * 160;
    const close = start + step * i + wave;
    const open = close - (direction === "up" ? 35 : -35);
    out.push({
      time: 1_700_000_000 + i * 86_400,
      open,
      high: Math.max(open, close) + 180,
      low: Math.min(open, close) - 180,
      close,
      volume: 900 + (i % 17) * 30,
    });
  }

  return out;
}

function run(name: string, test: () => void): void {
  try {
    test();
    console.log(`[PASS] ${name}`);
  } catch (error) {
    console.error(`[FAIL] ${name}`);
    throw error;
  }
}

run("상승 장기 데이터는 중립보다 높은 점수를 만든다", () => {
  const result = analyzeLongTermTrend(makeTrend("up"), "1d");
  assert(result.score > 50, `상승 점수가 너무 낮음: ${result.score}`);
});

run("하락 장기 데이터는 중립보다 낮은 점수를 만든다", () => {
  const result = analyzeLongTermTrend(makeTrend("down"), "1d");
  assert(result.score < 50, `하락 점수가 너무 높음: ${result.score}`);
});

run("조건별 시나리오 강도의 합은 100이다", () => {
  const result = analyzeLongTermTrend(makeTrend("up"), "4h");
  const sum = result.scenarios.reduce((total, scenario) => total + scenario.strength, 0);
  assert(sum === 100, `시나리오 합계가 100이 아님: ${sum}`);
});

run("장기 종합은 주봉 40 · 일봉 40 · 4H 20 가중치를 사용한다", () => {
  const weekly = analyzeLongTermTrend(makeTrend("down"), "1w");
  const daily = analyzeLongTermTrend(makeTrend("up"), "1d");
  const fourHour = analyzeLongTermTrend(makeTrend("up"), "4h");
  const combined = combineLongTermTrends(weekly, daily, fourHour);
  assert(combined != null, "종합 결과가 없음");
  const expected = Math.round(weekly.score * 0.4 + daily.score * 0.4 + fourHour.score * 0.2);
  assert(combined.score === expected, `가중 점수 불일치: ${combined.score} != ${expected}`);
});

run("충분한 표본은 데이터 충족도 100을 만든다", () => {
  const result = analyzeLongTermTrend(makeTrend("up", 360), "1w");
  assert(result.dataQuality === 100, `데이터 충족도 오류: ${result.dataQuality}`);
});

run("현재 판단 지지는 8% 이내의 가장 가까운 4H/일봉 레벨을 선택한다", () => {
  const result = selectReferenceLevels(
    81_000,
    { timeframe: "1w", support: 58_000, resistance: 95_000 },
    { timeframe: "1d", support: 65_000, resistance: 82_850 },
    { timeframe: "4h", support: 78_800, resistance: 82_200 },
  );
  assert(result.longTermSupport === 65_000, `장기 지지 보존 실패: ${result.longTermSupport}`);
  assert(result.currentSupport === 78_800, `현재 지지 선택 오류: ${result.currentSupport}`);
  assert(result.currentResistance === 82_200, `현재 저항 선택 오류: ${result.currentResistance}`);
  assert(result.currentSupportSource === "4h", `현재 지지 출처 오류: ${result.currentSupportSource}`);
  assert(result.neutralRangeEligible, "가까운 지지/저항 범위가 횡보 후보가 되어야 함");
});

run("너무 먼 장기 지지는 현재 횡보 시나리오 활성 조건에서 제외한다", () => {
  const result = selectReferenceLevels(
    81_000,
    { timeframe: "1w", support: 58_000, resistance: 95_000 },
    { timeframe: "1d", support: 65_000, resistance: 82_850 },
    { timeframe: "4h", support: null, resistance: 82_200 },
  );
  assert(result.longTermSupport === 65_000, "장기 지지는 보존되어야 함");
  assert(result.currentSupport === null, `먼 지지가 현재 지지로 선택됨: ${result.currentSupport}`);
  assert(!result.neutralRangeEligible, "현재 지지가 없는데 횡보 active가 되면 안 됨");
});

run("횡보는 근거리 유효 범위가 있을 때만 active가 된다", () => {
  const active = decideScenarioActivation({
    neutralRangeEligible: true,
    neutralRangeReason: "근거리 범위 확인",
    bullishBreakoutConfirmed: false,
    bearishBreakdownConfirmed: false,
  });
  assert(active.neutral.state === "active", `횡보 상태 오류: ${active.neutral.state}`);

  const watch = decideScenarioActivation({
    neutralRangeEligible: false,
    neutralRangeReason: "범위가 너무 넓음",
    bullishBreakoutConfirmed: false,
    bearishBreakdownConfirmed: false,
  });
  assert(watch.neutral.state === "watch", `넓은 범위 횡보 상태 오류: ${watch.neutral.state}`);
});

run("거래량이 확인된 상승 구조 돌파는 상승 시나리오를 active로 승격한다", () => {
  const result = decideScenarioActivation({
    neutralRangeEligible: true,
    neutralRangeReason: "근거리 범위 확인",
    bullishBreakoutConfirmed: true,
    bearishBreakdownConfirmed: false,
  });
  assert(result.bullish.state === "active", `상승 승격 실패: ${result.bullish.state}`);
  assert(result.neutral.state === "invalidated", `횡보 약화 실패: ${result.neutral.state}`);
});
