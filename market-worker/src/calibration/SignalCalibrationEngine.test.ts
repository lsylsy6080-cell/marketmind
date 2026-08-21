import { buildFundingCrowdingModel, calibrateNewsThresholds, classifyNewsScore } from "./SignalCalibrationEngine";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}
function test(name: string, fn: () => void): void {
  fn();
  console.log(`[PASS] ${name}`);
}

const newsRows = Array.from({ length: 1000 }, (_, i) => ({
  weighted_score: 48 + (i / 999) * 4,
}));

test("News P10/P90 동적 threshold 후보를 만든다", () => {
  const result = calibrateNewsThresholds(newsRows);
  assert(result.status === "candidate_ready", "candidate_ready 예상");
  assert(result.bearishThreshold !== null && result.bullishThreshold !== null, "threshold 누락");
  assert(result.bearishThreshold! < result.bullishThreshold!, "threshold 순서 오류");
  assert(result.expectedBullishRate > 0.08 && result.expectedBullishRate < 0.12, "bullish rate가 약 10%가 아님");
});

test("News candidate classifier는 양 극단만 방향 신호로 분류한다", () => {
  assert(classifyNewsScore(52, 49, 51) === "bullish", "bullish 분류 실패");
  assert(classifyNewsScore(48, 49, 51) === "bearish", "bearish 분류 실패");
  assert(classifyNewsScore(50, 49, 51) === "neutral", "neutral 분류 실패");
});

test("양수 Funding 상단 분위수는 long crowding / bearish contrarian 후보가 된다", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ fetched_at: new Date(1_700_000_000_000 + i * 60_000).toISOString(), funding_rate: ((0.1 + i / 220) / 10_000) }));
  const result = buildFundingCrowdingModel(rows);
  assert(result.status === "candidate_ready", "candidate_ready 예상");
  assert(result.crowdingSide === "long_crowded", "long crowding 예상");
  assert(result.contrarianBias === "bearish", "bearish contrarian 예상");
  assert(result.contrarianAdjustment < 0, "음수 adjustment 예상");
});

test("표본이 부족하면 자동 후보 사용을 보류한다", () => {
  const result = calibrateNewsThresholds([{ weighted_score: 49 }, { weighted_score: 51 }]);
  assert(result.status === "insufficient_data", "insufficient_data 예상");
});
