import {
  calculatePositionReturnPercent,
  calculateUnrealizedPnl,
  deriveProtectionThresholds,
  determineCloseReason,
  evaluateEntryEligibility,
  updatePositionExcursion,
  validateStrategyConfig,
} from "./PaperTradingRules";
import type {
  PaperDecision,
  PaperPosition,
  PaperStrategyConfig,
} from "./PaperTradingRules";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(run: () => void, message: string): void {
  let thrown = false;

  try {
    run();
  } catch {
    thrown = true;
  }

  assert(thrown, message);
}

const nowMs = Date.parse("2026-07-31T06:00:00.000Z");

const config: PaperStrategyConfig = {
  symbol: "BTCUSDT",
  longScoreMin: 60,
  shortScoreMax: 40,
  confidenceMin: 55,
  maxHoldingMinutes: 120,
  allowLong: true,
  allowShort: true,
};

const bullishDecision: PaperDecision = {
  decidedAt: "2026-07-31T05:50:00.000Z",
  finalScore: 76,
  finalConfidence: 82,
  direction: "bullish",
  action: "strong_buy",
  tradingPermission: "allowed",
};

const longPosition: PaperPosition = {
  side: "long",
  quantity: 0.01,
  entryPrice: 100_000,
  stopLossPrice: 98_000,
  takeProfitPrice: 104_000,
  openedAt: "2026-07-31T05:30:00.000Z",
};

interface TestCase {
  name: string;
  run: () => void;
}

const tests: readonly TestCase[] = [
  {
    name: "유효한 강세 판단은 LONG 진입을 허용한다",
    run: () => {
      const result = evaluateEntryEligibility(
        config,
        bullishDecision,
        30,
        nowMs,
      );
      assert(result.allowed, "LONG 진입이 허용되지 않았습니다.");
    },
  },
  {
    name: "30분이 지난 판단은 신규 진입을 차단한다",
    run: () => {
      const result = evaluateEntryEligibility(
        config,
        {
          ...bullishDecision,
          decidedAt: "2026-07-31T05:20:00.000Z",
        },
        30,
        nowMs,
      );
      assert(!result.allowed, "오래된 판단으로 신규 진입했습니다.");
    },
  },
  {
    name: "blocked 판단은 신규 진입을 차단한다",
    run: () => {
      const result = evaluateEntryEligibility(
        config,
        {
          ...bullishDecision,
          tradingPermission: "blocked",
        },
        30,
        nowMs,
      );
      assert(!result.allowed, "blocked 판단으로 신규 진입했습니다.");
    },
  },
  {
    name: "손절 조건을 최우선으로 감지한다",
    run: () => {
      const result = determineCloseReason(
        longPosition,
        config,
        bullishDecision,
        97_900,
        30,
        nowMs,
      );
      assert(result === "stop_loss", "손절 조건을 감지하지 못했습니다.");
    },
  },
  {
    name: "익절 조건을 감지한다",
    run: () => {
      const result = determineCloseReason(
        longPosition,
        config,
        bullishDecision,
        104_100,
        30,
        nowMs,
      );
      assert(result === "take_profit", "익절 조건을 감지하지 못했습니다.");
    },
  },
  {
    name: "최대 보유 시간을 초과하면 청산한다",
    run: () => {
      const result = determineCloseReason(
        {
          ...longPosition,
          openedAt: "2026-07-31T03:30:00.000Z",
        },
        config,
        bullishDecision,
        101_000,
        30,
        nowMs,
      );
      assert(result === "max_holding", "최대 보유 청산을 감지하지 못했습니다.");
    },
  },
  {
    name: "유효한 반대 신호는 포지션을 청산한다",
    run: () => {
      const result = determineCloseReason(
        longPosition,
        config,
        {
          ...bullishDecision,
          finalScore: 24,
          direction: "bearish",
          action: "sell",
        },
        101_000,
        30,
        nowMs,
      );
      assert(result === "opposite_signal", "반대 신호 청산을 감지하지 못했습니다.");
    },
  },
  {
    name: "최대 보유 시점과 반대 신호가 겹치면 반대 신호를 우선 기록한다",
    run: () => {
      const result = determineCloseReason(
        {
          ...longPosition,
          openedAt: "2026-07-31T03:30:00.000Z",
        },
        config,
        {
          ...bullishDecision,
          finalScore: 24,
          direction: "bearish",
          action: "sell",
        },
        101_000,
        30,
        nowMs,
      );
      assert(
        result === "opposite_signal",
        "동시 충족 시 반대 신호가 max_holding에 가려졌습니다.",
      );
    },
  },
  {
    name: "오래된 반대 신호는 청산에 사용하지 않는다",
    run: () => {
      const result = determineCloseReason(
        longPosition,
        config,
        {
          ...bullishDecision,
          decidedAt: "2026-07-31T05:00:00.000Z",
          finalScore: 24,
          direction: "bearish",
          action: "sell",
        },
        101_000,
        30,
        nowMs,
      );
      assert(result === null, "오래된 반대 신호로 포지션을 청산했습니다.");
    },
  },
  {
    name: "MFE와 MAE를 포지션 방향 기준 수익률로 누적한다",
    run: () => {
      let excursion = updatePositionExcursion(
        { mfePercent: 0, maePercent: 0 },
        calculatePositionReturnPercent(longPosition, 101_200),
      );
      excursion = updatePositionExcursion(
        excursion,
        calculatePositionReturnPercent(longPosition, 99_500),
      );

      assert(Math.abs(excursion.mfePercent - 1.2) < 0.000001, "MFE 누적이 올바르지 않습니다.");
      assert(Math.abs(excursion.maePercent - (-0.5)) < 0.000001, "MAE 누적이 올바르지 않습니다.");
    },
  },
  {
    name: "TP 목표 폭에 비례해 보호 청산 임계값을 산출한다",
    run: () => {
      const thresholds = deriveProtectionThresholds(longPosition);
      assert(Math.abs(thresholds.targetReturnPercent - 4) < 0.000001, "TP 목표 수익률 계산이 틀렸습니다.");
      assert(Math.abs(thresholds.breakEvenActivationPercent - 0.75) < 0.000001, "BE 활성 기준 상한이 틀렸습니다.");
      assert(Math.abs(thresholds.trailingActivationPercent - 1.4) < 0.000001, "Trailing 활성 기준이 틀렸습니다.");
      assert(Math.abs(thresholds.trailingGivebackPercent - 0.6) < 0.000001, "Trailing 반납 기준이 틀렸습니다.");
    },
  },
  {
    name: "충분한 MFE 뒤 수익을 반납하면 trailing_profit으로 청산한다",
    run: () => {
      const result = determineCloseReason(
        longPosition,
        config,
        bullishDecision,
        100_900,
        30,
        nowMs,
        { mfePercent: 1.6, maePercent: -0.2 },
      );
      assert(result === "trailing_profit", "트레일링 수익 보호를 감지하지 못했습니다.");
    },
  },
  {
    name: "BE 활성 이후 수익을 거의 모두 반납하면 break_even으로 청산한다",
    run: () => {
      const result = determineCloseReason(
        longPosition,
        config,
        bullishDecision,
        100_040,
        30,
        nowMs,
        { mfePercent: 0.8, maePercent: -0.1 },
      );
      assert(result === "break_even", "본전 보호 청산을 감지하지 못했습니다.");
    },
  },
  {
    name: "LONG과 SHORT의 미실현 손익을 올바르게 계산한다",
    run: () => {
      const longPnl = calculateUnrealizedPnl(longPosition, 101_000);
      const shortPnl = calculateUnrealizedPnl(
        { ...longPosition, side: "short" },
        99_000,
      );

      assert(longPnl === 10, "LONG 미실현 손익이 올바르지 않습니다.");
      assert(shortPnl === 10, "SHORT 미실현 손익이 올바르지 않습니다.");
    },
  },
  {
    name: "잘못된 전략 임계값을 거부한다",
    run: () => {
      assertThrows(
        () =>
          validateStrategyConfig({
            ...config,
            shortScoreMax: 70,
            longScoreMin: 60,
          }),
        "겹치는 진입 임계값을 허용했습니다.",
      );
    },
  },
];

export function runPaperTradingRulesTests(): void {
  for (const test of tests) {
    test.run();
    console.log(`[PASS] ${test.name}`);
  }

  console.log(`[DONE] Paper Trading Rules ${tests.length}개 검증 통과`);
}

runPaperTradingRulesTests();
