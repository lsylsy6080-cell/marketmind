import { runDecisionEngine } from "./DecisionEngine";
import type {
  DecisionEngineInput,
  DecisionEngineResult,
  DecisionReason,
} from "./types";

interface DecisionEngineTestCase {
  name: string;
  input: DecisionEngineInput;
  verify: (result: DecisionEngineResult) => void;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function findReason(
  result: DecisionEngineResult,
  type: DecisionReason["type"],
): DecisionReason {
  const reason = result.reasons.find((item) => item.type === type);

  assert(reason, `${type} 판단 근거가 없습니다.`);
  return reason;
}

const bullishInput: DecisionEngineInput = {
  technical: {
    score: 84,
    confidence: 88,
    direction: "bullish",
    riskLevel: "low",
    tradingPermission: "allowed",
    marketRegime: "trend",
  },
  news: {
    score: 82,
    confidence: 86,
    direction: "bullish",
    riskLevel: "low",
    conflictScore: 8,
    marketPressure: "strong_bullish",
    articleCount: 10,
    dominantCategory: "institutional",
  },
  funding: {
    score: 80,
    confidence: 82,
    direction: "bullish",
    riskLevel: "low",
    tradingPermission: "allowed",
    fundingRate: 0.00008,
    fundingRatePercent: 0.008,
    annualizedRatePercent: 8.76,
  },
};

const testCases: readonly DecisionEngineTestCase[] = [
  {
    name: "강한 상승 신호는 strong_buy를 반환한다",
    input: bullishInput,
    verify: (result) => {
      assert(result.direction === "bullish", "최종 방향이 bullish가 아닙니다.");
      assert(result.action === "strong_buy", "강한 매수 판단이 나오지 않았습니다.");
      assert(result.riskLevel === "low", "최종 위험도가 low가 아닙니다.");
      assert(
        result.tradingPermission === "allowed",
        "거래 권한이 allowed가 아닙니다.",
      );
      assert(
        result.alignment === "strong_alignment",
        "신호가 strong_alignment로 판정되지 않았습니다.",
      );
    },
  },
  {
    name: "상승·하락 신호 충돌은 거래 행동을 wait로 제한한다",
    input: {
      technical: {
        score: 82,
        confidence: 85,
        direction: "bullish",
        riskLevel: "normal",
        tradingPermission: "allowed",
      },
      news: {
        score: 18,
        confidence: 80,
        direction: "bearish",
        riskLevel: "normal",
        conflictScore: 75,
        articleCount: 8,
      },
      funding: {
        score: 78,
        confidence: 76,
        direction: "bullish",
        riskLevel: "normal",
        tradingPermission: "allowed",
        fundingRatePercent: 0.018,
      },
    },
    verify: (result) => {
      assert(result.alignment === "conflict", "신호 충돌을 감지하지 못했습니다.");
      assert(result.riskLevel === "high", "충돌 위험도가 high가 아닙니다.");
      assert(
        result.tradingPermission === "caution",
        "충돌 시 거래 권한이 caution이 아닙니다.",
      );
      assert(result.action === "wait", "충돌 시 최종 행동이 wait가 아닙니다.");
    },
  },
  {
    name: "critical 위험은 거래를 차단한다",
    input: {
      ...bullishInput,
      technical: {
        ...bullishInput.technical,
        riskLevel: "critical",
      },
    },
    verify: (result) => {
      assert(result.riskLevel === "critical", "critical 위험이 유지되지 않았습니다.");
      assert(
        result.tradingPermission === "blocked",
        "critical 위험에서 거래가 차단되지 않았습니다.",
      );
      assert(result.action === "wait", "차단 상태의 최종 행동이 wait가 아닙니다.");
    },
  },
  {
    name: "caution 상태에서는 strong_buy를 buy로 제한한다",
    input: {
      ...bullishInput,
      technical: {
        ...bullishInput.technical,
        tradingPermission: "caution",
      },
    },
    verify: (result) => {
      const permissionReason = findReason(result, "permission");

      assert(
        result.tradingPermission === "caution",
        "주의 권한이 최종 결과에 반영되지 않았습니다.",
      );
      assert(result.action === "buy", "strong_buy 안전 제한이 적용되지 않았습니다.");
      assert(
        permissionReason.safety_guard_applied === true,
        "안전 제한 적용 근거가 기록되지 않았습니다.",
      );
    },
  },
  {
    name: "입력 direction이 score와 다르면 score 기준으로 정규화한다",
    input: {
      ...bullishInput,
      technical: {
        ...bullishInput.technical,
        direction: "bearish",
      },
    },
    verify: (result) => {
      const technicalReason = findReason(result, "technical");

      assert(
        technicalReason.direction === "bullish",
        "기술 신호 방향이 점수 기준으로 정규화되지 않았습니다.",
      );
      assert(result.direction === "bullish", "최종 방향이 잘못 변경되었습니다.");
    },
  },
  {
    name: "ETF 데이터가 있으면 가중치와 판단 근거에 반영한다",
    input: {
      ...bullishInput,
      etf: {
        score: 86,
        confidence: 90,
        direction: "bullish",
        riskLevel: "low",
        freshness: 0.95,
        netFlow: 320,
        observedAt: "2026-07-31T00:00:00.000Z",
        source: "test",
      },
    },
    verify: (result) => {
      assert((result.weights.etf ?? 0) > 0, "ETF 가중치가 적용되지 않았습니다.");
      assert(
        result.reasons.some((reason) => reason.type === "etf"),
        "ETF 판단 근거가 기록되지 않았습니다.",
      );
    },
  },
];

export function runDecisionEngineTests(): void {
  for (const testCase of testCases) {
    const result = runDecisionEngine(testCase.input);
    testCase.verify(result);
    console.log(`[PASS] ${testCase.name}`);
  }

  let invalidInputRejected = false;

  try {
    runDecisionEngine({
      ...bullishInput,
      technical: {
        ...bullishInput.technical,
        score: Number.NaN,
      },
    });
  } catch {
    invalidInputRejected = true;
  }

  assert(invalidInputRejected, "잘못된 숫자 입력을 차단하지 못했습니다.");
  console.log("[PASS] 잘못된 숫자 입력을 차단한다");
  console.log(`[DONE] Decision Engine ${testCases.length + 1}개 검증 통과`);
}

runDecisionEngineTests();
