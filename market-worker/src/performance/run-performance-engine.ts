import { supabase } from "../lib/supabase";

const PERFORMANCE_BATCH_SIZE = 100;
const DEFAULT_THRESHOLD_PERCENT = 0.1;

type Direction =
  | "bullish"
  | "neutral"
  | "bearish";

type FinalAction =
  | "strong_buy"
  | "buy"
  | "wait"
  | "reduce"
  | "sell";

type TradingPermission =
  | "allowed"
  | "caution"
  | "blocked";

type RiskLevel =
  | "low"
  | "normal"
  | "high"
  | "critical";

type EvaluationResult =
  | "correct"
  | "incorrect"
  | "neutral";

type ActionResult =
  | "correct"
  | "incorrect"
  | "neutral"
  | "ignored";

interface CompletedBacktestRow {
  id: number;
  decision_id: number;
  symbol: string;
  return_24h: number | string;
}

interface FinalDecisionRow {
  id: number;
  symbol: string;
  final_score: number | string;
  final_confidence: number | string;
  direction: Direction;
  action: FinalAction;
  trading_permission: TradingPermission;
  risk_level: RiskLevel;
  strategy_version: string;
}

function toFiniteNumber(
  value: number | string,
  label: string,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${label} 값이 올바르지 않습니다.`,
    );
  }

  return parsed;
}

function round(
  value: number,
  digits: number,
): number {
  const multiplier = 10 ** digits;

  return (
    Math.round(value * multiplier) /
    multiplier
  );
}

function evaluateDirection(
  direction: Direction,
  marketReturn: number,
  thresholdPercent: number,
): EvaluationResult {
  if (direction === "bullish") {
    if (marketReturn > thresholdPercent) {
      return "correct";
    }

    if (marketReturn < -thresholdPercent) {
      return "incorrect";
    }

    return "neutral";
  }

  if (direction === "bearish") {
    if (marketReturn < -thresholdPercent) {
      return "correct";
    }

    if (marketReturn > thresholdPercent) {
      return "incorrect";
    }

    return "neutral";
  }

  return Math.abs(marketReturn) <= thresholdPercent
    ? "correct"
    : "incorrect";
}

function evaluateAction(
  action: FinalAction,
  tradingPermission: TradingPermission,
  marketReturn: number,
  thresholdPercent: number,
): ActionResult {
  if (tradingPermission === "blocked") {
    return "ignored";
  }

  if (
    action === "strong_buy" ||
    action === "buy"
  ) {
    if (marketReturn > thresholdPercent) {
      return "correct";
    }

    if (marketReturn < -thresholdPercent) {
      return "incorrect";
    }

    return "neutral";
  }

  if (
    action === "reduce" ||
    action === "sell"
  ) {
    if (marketReturn < -thresholdPercent) {
      return "correct";
    }

    if (marketReturn > thresholdPercent) {
      return "incorrect";
    }

    return "neutral";
  }

  return Math.abs(marketReturn) <= thresholdPercent
    ? "correct"
    : "incorrect";
}

function calculateDirectionalReturn(
  direction: Direction,
  marketReturn: number,
): number {
  if (direction === "bullish") {
    return round(marketReturn, 6);
  }

  if (direction === "bearish") {
    return round(-marketReturn, 6);
  }

  return round(-Math.abs(marketReturn), 6);
}

function buildEvaluationReason(
  decision: FinalDecisionRow,
  marketReturn: number,
  thresholdPercent: number,
  directionResult: EvaluationResult,
  actionResult: ActionResult,
): string {
  const returnText =
    `${round(marketReturn, 6)}%`;

  return [
    `24시간 실제 수익률은 ${returnText}입니다.`,
    `중립 기준은 ±${thresholdPercent}%입니다.`,
    `방향 ${decision.direction} 평가는 ${directionResult}입니다.`,
    `행동 ${decision.action} 평가는 ${actionResult}입니다.`,
    `거래 권한은 ${decision.trading_permission}입니다.`,
  ].join(" ");
}

async function getCompletedBacktests(): Promise<
  CompletedBacktestRow[]
> {
  const { data, error } = await supabase
    .from("final_market_backtests")
    .select(
      `
      id,
      decision_id,
      symbol,
      return_24h
      `,
    )
    .eq("status", "completed")
    .not("return_24h", "is", null)
    .order("entry_time", {
      ascending: true,
    })
    .limit(PERFORMANCE_BATCH_SIZE);

  if (error) {
    throw new Error(
      `완료 Backtest 조회 실패: ${error.message}`,
    );
  }

  return (
    (data ?? []) as unknown as
      CompletedBacktestRow[]
  );
}

async function getExistingBacktestIds(
  backtestIds: number[],
): Promise<Set<number>> {
  if (backtestIds.length === 0) {
    return new Set<number>();
  }

  const { data, error } = await supabase
    .from("final_market_performance")
    .select("backtest_id")
    .in("backtest_id", backtestIds);

  if (error) {
    throw new Error(
      `기존 Performance 조회 실패: ${error.message}`,
    );
  }

  return new Set(
    (data ?? []).map(
      (row: { backtest_id: number }) =>
        Number(row.backtest_id),
    ),
  );
}

async function getDecision(
  decisionId: number,
): Promise<FinalDecisionRow> {
  const { data, error } = await supabase
    .from("final_market_decisions")
    .select(
      `
      id,
      symbol,
      final_score,
      final_confidence,
      direction,
      action,
      trading_permission,
      risk_level,
      strategy_version
      `,
    )
    .eq("id", decisionId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Final Decision 조회 실패: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      `decision_id=${decisionId} Final Decision이 없습니다.`,
    );
  }

  return data as unknown as FinalDecisionRow;
}

async function evaluateOneBacktest(
  backtest: CompletedBacktestRow,
): Promise<void> {
  const decision =
    await getDecision(backtest.decision_id);

  const marketReturn =
    toFiniteNumber(
      backtest.return_24h,
      "return_24h",
    );

  const finalScore =
    toFiniteNumber(
      decision.final_score,
      "final_score",
    );

  const finalConfidence =
    toFiniteNumber(
      decision.final_confidence,
      "final_confidence",
    );

  const thresholdPercent =
    DEFAULT_THRESHOLD_PERCENT;

  const directionResult =
    evaluateDirection(
      decision.direction,
      marketReturn,
      thresholdPercent,
    );

  const actionResult =
    evaluateAction(
      decision.action,
      decision.trading_permission,
      marketReturn,
      thresholdPercent,
    );

  const directionalReturn =
    calculateDirectionalReturn(
      decision.direction,
      marketReturn,
    );

  const evaluationStatus =
    actionResult === "ignored"
      ? "ignored"
      : "completed";

  const evaluationReason =
    buildEvaluationReason(
      decision,
      marketReturn,
      thresholdPercent,
      directionResult,
      actionResult,
    );

  const { error } = await supabase
    .from("final_market_performance")
    .upsert(
      {
        decision_id: decision.id,
        backtest_id: backtest.id,
        symbol:
          decision.symbol ||
          backtest.symbol,
        strategy_version:
          decision.strategy_version,
        direction:
          decision.direction,
        action:
          decision.action,
        trading_permission:
          decision.trading_permission,
        risk_level:
          decision.risk_level,
        final_score:
          round(finalScore, 4),
        final_confidence:
          round(finalConfidence, 4),
        evaluation_horizon: "24h",
        market_return:
          round(marketReturn, 6),
        directional_return:
          directionalReturn,
        threshold_percent:
          thresholdPercent,
        direction_result:
          directionResult,
        action_result:
          actionResult,
        evaluation_status:
          evaluationStatus,
        evaluation_reason:
          evaluationReason,
        evaluated_at:
          new Date().toISOString(),
      },
      {
        onConflict: "backtest_id",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    throw new Error(
      `Performance 저장 실패: ${error.message}`,
    );
  }
}

export async function runPerformanceEngine(): Promise<void> {
  console.log(
    "[Performance Engine] V1 실행 시작",
  );

  const completedBacktests =
    await getCompletedBacktests();

  if (completedBacktests.length === 0) {
    console.log(
      "[Performance Engine] 평가 가능한 완료 Backtest가 없습니다.",
    );
    return;
  }

  const existingIds =
    await getExistingBacktestIds(
      completedBacktests.map(
        (row) => row.id,
      ),
    );

  const targets =
    completedBacktests.filter(
      (row) => !existingIds.has(row.id),
    );

  if (targets.length === 0) {
    console.log(
      "[Performance Engine] 신규 평가 대상이 없습니다.",
    );
    return;
  }

  let completed = 0;
  let failed = 0;

  for (const backtest of targets) {
    try {
      await evaluateOneBacktest(backtest);
      completed += 1;
    } catch (error: unknown) {
      failed += 1;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[Performance Engine] backtest_id=${backtest.id}, decision_id=${backtest.decision_id} 평가 실패: ${message}`,
      );
    }
  }

  console.log(
    "[Performance Engine] V1 실행 완료",
    {
      found: completedBacktests.length,
      targets: targets.length,
      completed,
      failed,
    },
  );
}
