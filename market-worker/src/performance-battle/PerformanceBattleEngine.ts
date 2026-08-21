import type {
  BattleAction,
  BattleDirection,
  BattleHorizon,
  BattlePair,
  BattlePermission,
  BattleHorizonComparison,
  EngineHorizonMetrics,
  PerformanceBattleResult,
  SegmentMetrics,
  WaitMetrics,
} from "./types";

const RETURN_THRESHOLD = 0.1;
export const MIN_PAIRS_FOR_WINNER = 30;

const round = (value: number, digits = 4): number => {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
};

type Eval = "correct" | "incorrect" | "neutral";

function evaluateDirection(direction: BattleDirection, marketReturn: number): Eval {
  if (direction === "bullish") {
    if (marketReturn > RETURN_THRESHOLD) return "correct";
    if (marketReturn < -RETURN_THRESHOLD) return "incorrect";
    return "neutral";
  }
  if (direction === "bearish") {
    if (marketReturn < -RETURN_THRESHOLD) return "correct";
    if (marketReturn > RETURN_THRESHOLD) return "incorrect";
    return "neutral";
  }
  return Math.abs(marketReturn) <= RETURN_THRESHOLD ? "correct" : "incorrect";
}

function directionalReturn(direction: BattleDirection, marketReturn: number): number {
  if (direction === "bullish") return marketReturn;
  if (direction === "bearish") return -marketReturn;
  return -Math.abs(marketReturn);
}

function evaluateAction(
  action: BattleAction,
  permission: BattlePermission,
  marketReturn: number,
): Eval | "ignored" {
  if (permission === "blocked") return "ignored";
  if (action === "strong_buy" || action === "buy") {
    if (marketReturn > RETURN_THRESHOLD) return "correct";
    if (marketReturn < -RETURN_THRESHOLD) return "incorrect";
    return "neutral";
  }
  if (action === "reduce" || action === "sell") {
    if (marketReturn < -RETURN_THRESHOLD) return "correct";
    if (marketReturn > RETURN_THRESHOLD) return "incorrect";
    return "neutral";
  }
  return Math.abs(marketReturn) <= RETURN_THRESHOLD ? "correct" : "incorrect";
}

function emptyMetrics(): EngineHorizonMetrics {
  return {
    evaluated: 0,
    directionCorrect: 0,
    directionIncorrect: 0,
    directionNeutral: 0,
    directionAccuracy: null,
    avgDirectionalReturn: null,
    actionCorrect: 0,
    actionIncorrect: 0,
    actionNeutral: 0,
    actionIgnored: 0,
    actionAccuracy: null,
    buySignals: 0,
    sellSignals: 0,
    waitSignals: 0,
  };
}

function calculateEngineMetrics(
  pairs: BattlePair[],
  engine: "v1" | "v2",
  horizon: BattleHorizon,
): EngineHorizonMetrics {
  const metrics = emptyMetrics();
  const directionalReturns: number[] = [];

  for (const pair of pairs) {
    const marketReturn = pair.returns[horizon];
    if (marketReturn == null || !Number.isFinite(marketReturn)) continue;

    const decision = pair[engine];
    metrics.evaluated += 1;

    const d = evaluateDirection(decision.direction, marketReturn);
    if (d === "correct") metrics.directionCorrect += 1;
    else if (d === "incorrect") metrics.directionIncorrect += 1;
    else metrics.directionNeutral += 1;

    directionalReturns.push(directionalReturn(decision.direction, marketReturn));

    const a = evaluateAction(decision.action, decision.tradingPermission, marketReturn);
    if (a === "correct") metrics.actionCorrect += 1;
    else if (a === "incorrect") metrics.actionIncorrect += 1;
    else if (a === "neutral") metrics.actionNeutral += 1;
    else metrics.actionIgnored += 1;

    if (decision.action === "strong_buy" || decision.action === "buy") metrics.buySignals += 1;
    else if (decision.action === "reduce" || decision.action === "sell") metrics.sellSignals += 1;
    else metrics.waitSignals += 1;
  }

  const directionalResolved = metrics.directionCorrect + metrics.directionIncorrect;
  if (directionalResolved > 0) {
    metrics.directionAccuracy = round(metrics.directionCorrect / directionalResolved, 4);
  }
  if (directionalReturns.length > 0) {
    metrics.avgDirectionalReturn = round(
      directionalReturns.reduce((a, b) => a + b, 0) / directionalReturns.length,
      6,
    );
  }

  const actionResolved = metrics.actionCorrect + metrics.actionIncorrect;
  if (actionResolved > 0) {
    metrics.actionAccuracy = round(metrics.actionCorrect / actionResolved, 4);
  }

  return metrics;
}

function calculateWaitMetrics(pairs: BattlePair[], horizon: BattleHorizon): WaitMetrics {
  const result: WaitMetrics = {
    waits: 0,
    evaluated: 0,
    avoidedBadEntry: 0,
    missedOpportunity: 0,
    correctNeutralWait: 0,
    ambiguous: 0,
    avoidanceRate: null,
  };

  for (const pair of pairs) {
    if (pair.v2.action !== "wait") continue;
    result.waits += 1;

    const r = pair.returns[horizon];
    if (r == null || !Number.isFinite(r)) continue;
    result.evaluated += 1;

    if (Math.abs(r) <= RETURN_THRESHOLD) {
      result.correctNeutralWait += 1;
      continue;
    }

    if (pair.v2.direction === "bullish") {
      if (r < -RETURN_THRESHOLD) result.avoidedBadEntry += 1;
      else result.missedOpportunity += 1;
      continue;
    }
    if (pair.v2.direction === "bearish") {
      if (r > RETURN_THRESHOLD) result.avoidedBadEntry += 1;
      else result.missedOpportunity += 1;
      continue;
    }

    // Neutral WAIT: 큰 움직임은 방향을 맞히진 못했으므로 ambiguous로 분리한다.
    result.ambiguous += 1;
  }

  const directionalWaits = result.avoidedBadEntry + result.missedOpportunity;
  if (directionalWaits > 0) {
    result.avoidanceRate = round(result.avoidedBadEntry / directionalWaits, 4);
  }
  return result;
}

function comparisonWinner(
  pairs: number,
  v1: EngineHorizonMetrics,
  v2: EngineHorizonMetrics,
): BattleHorizonComparison["winner"] {
  if (pairs < MIN_PAIRS_FOR_WINNER) return "inconclusive";

  const d1 = v1.directionAccuracy;
  const d2 = v2.directionAccuracy;
  const r1 = v1.avgDirectionalReturn;
  const r2 = v2.avgDirectionalReturn;
  if (d1 == null || d2 == null || r1 == null || r2 == null) return "inconclusive";

  const accuracyDelta = d2 - d1;
  const returnDelta = r2 - r1;

  // 승자 판정은 한 지표만 우연히 앞서는 것을 막기 위해 정확도와 방향성 수익을 함께 본다.
  if (accuracyDelta >= 0.03 && returnDelta > 0) return "v2";
  if (accuracyDelta <= -0.03 && returnDelta < 0) return "v1";
  if (Math.abs(accuracyDelta) < 0.01 && Math.abs(returnDelta) < 0.03) return "tie";
  return "inconclusive";
}

export function compareHorizon(
  pairs: BattlePair[],
  horizon: BattleHorizon,
): BattleHorizonComparison {
  const comparable = pairs.filter((p) => p.returns[horizon] != null);
  const v1 = calculateEngineMetrics(comparable, "v1", horizon);
  const v2 = calculateEngineMetrics(comparable, "v2", horizon);
  const v2Wait = calculateWaitMetrics(comparable, horizon);

  return {
    horizon,
    comparablePairs: comparable.length,
    v1,
    v2,
    v2Wait,
    directionAccuracyDelta:
      v1.directionAccuracy != null && v2.directionAccuracy != null
        ? round(v2.directionAccuracy - v1.directionAccuracy, 4)
        : null,
    directionalReturnDelta:
      v1.avgDirectionalReturn != null && v2.avgDirectionalReturn != null
        ? round(v2.avgDirectionalReturn - v1.avgDirectionalReturn, 6)
        : null,
    actionAccuracyDelta:
      v1.actionAccuracy != null && v2.actionAccuracy != null
        ? round(v2.actionAccuracy - v1.actionAccuracy, 4)
        : null,
    winner: comparisonWinner(comparable.length, v1, v2),
  };
}

function segment(name: string, pairs: BattlePair[]): SegmentMetrics | null {
  if (pairs.length === 0) return null;
  return {
    segment: name,
    pairs: pairs.length,
    oneHour: compareHorizon(pairs, "1h"),
    fourHour: compareHorizon(pairs, "4h"),
    twentyFourHour: compareHorizon(pairs, "24h"),
  };
}

export function buildPerformanceBattle(
  pairs: BattlePair[],
  metadata: {
    candidateV2Snapshots: number;
    excludedLaggedPairs: number;
    maxPairingLagMinutes: number;
  },
): PerformanceBattleResult {
  const overall = (["1h", "4h", "24h"] as BattleHorizon[]).map((h) =>
    compareHorizon(pairs, h),
  );

  const regimeNames = [...new Set(pairs.map((p) => p.v2.regime).filter(Boolean))] as string[];
  const regimes = regimeNames
    .map((r) => segment(r, pairs.filter((p) => p.v2.regime === r)))
    .filter((x): x is SegmentMetrics => x != null);

  const overheat = segment(
    "overheat_guard",
    pairs.filter((p) => (p.v2.overheatRisk ?? 0) >= 60 && p.v2.action === "wait"),
  );
  const pullback = segment(
    "pullback_wait",
    pairs.filter((p) => p.v2.preferredEntry === "pullback" && p.v2.action === "wait"),
  );
  const news = segment(
    "news_limited",
    pairs.filter((p) => p.v2.newsLimitedApplied === true),
  );
  const funding = segment(
    "funding_crowding_active",
    pairs.filter((p) => p.v2.fundingCrowdingStatus === "active"),
  );

  const decisive = overall.filter((x) => x.winner === "v1" || x.winner === "v2");
  const v1Wins = decisive.filter((x) => x.winner === "v1").length;
  const v2Wins = decisive.filter((x) => x.winner === "v2").length;

  let verdict: PerformanceBattleResult["verdict"] = "inconclusive";
  let verdictReason = `최소 ${MIN_PAIRS_FOR_WINNER}개 페어가 확보된 horizon의 정확도와 방향성 수익을 함께 비교합니다.`;

  if (decisive.length > 0) {
    if (v2Wins > 0 && v1Wins === 0) {
      verdict = "v2_leads";
      verdictReason = `판정 가능한 ${decisive.length}개 horizon에서 V2가 ${v2Wins}개 우세하고 V1 우세는 없습니다.`;
    } else if (v1Wins > 0 && v2Wins === 0) {
      verdict = "v1_leads";
      verdictReason = `판정 가능한 ${decisive.length}개 horizon에서 V1이 ${v1Wins}개 우세하고 V2 우세는 없습니다.`;
    } else if (v1Wins > 0 && v2Wins > 0) {
      verdict = "mixed";
      verdictReason = `Horizon별 결과가 엇갈립니다(V1 ${v1Wins}, V2 ${v2Wins}).`;
    }
  }

  return {
    symbol: "BTCUSDT",
    calculatedAt: new Date().toISOString(),
    pairing: {
      candidateV2Snapshots: metadata.candidateV2Snapshots,
      linkedPairs: pairs.length,
      excludedLaggedPairs: metadata.excludedLaggedPairs,
      maxPairingLagMinutes: metadata.maxPairingLagMinutes,
    },
    overall,
    regimes,
    v2Diagnostics: {
      overheatGuard: overheat,
      pullbackWait: pullback,
      newsLimited: news,
      fundingCrowdingActive: funding,
    },
    verdict,
    verdictReason,
    minimumPairsForWinner: MIN_PAIRS_FOR_WINNER,
    methodology: [
      "V2 snapshot의 v1_decision_id로 같은 V1 판단과 연결합니다.",
      `V1과 V2 판단 시간차가 ${metadata.maxPairingLagMinutes}분을 초과한 쌍은 비교에서 제외합니다.`,
      "동일 V1 decision에 V2 snapshot이 여러 개면 가장 이른 V2 snapshot만 사용해 사후정보 누수를 줄입니다.",
      "시장 결과는 기존 final_market_backtests의 1h/4h/24h forward return만 사용합니다.",
      `방향/행동 중립 기준은 ±${RETURN_THRESHOLD}%입니다.`,
      `Winner는 최소 ${MIN_PAIRS_FOR_WINNER}개 비교 페어가 있고 방향 정확도와 평균 directional return이 함께 우세할 때만 판정합니다.`,
      "V2 WAIT는 avoided bad entry / missed opportunity / neutral wait로 별도 평가합니다.",
      "Regime·Overheat Guard·Pullback WAIT·News limited·Funding crowding 구간을 별도 세그먼트로 분석합니다.",
    ],
    strategyVersion: "performance-battle-v2.4",
  };
}
