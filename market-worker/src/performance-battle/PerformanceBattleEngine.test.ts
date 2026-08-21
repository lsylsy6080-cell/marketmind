import assert from "node:assert/strict";
import { buildPerformanceBattle, compareHorizon } from "./PerformanceBattleEngine";
import type { BattlePair } from "./types";

function pair(i: number, opts?: Partial<BattlePair>): BattlePair {
  const base: BattlePair = {
    v1: {
      engine: "v1", id: i, linkedV1DecisionId: i,
      decidedAt: "2026-08-21T00:00:00.000Z",
      direction: "bullish", action: "buy", tradingPermission: "allowed",
      finalScore: 70, finalConfidence: 70, strategyVersion: "v1",
    },
    v2: {
      engine: "v2", id: 1000+i, linkedV1DecisionId: i,
      decidedAt: "2026-08-21T00:05:00.000Z",
      direction: "bullish", action: "wait", tradingPermission: "caution",
      finalScore: 70, finalConfidence: 70, strategyVersion: "v2",
      regime: "strong_bull_trend", overheatRisk: 80, entryQualityScore: 25,
      preferredEntry: "pullback", newsLimitedApplied: true,
      fundingCrowdingStatus: "distribution_saturated",
    },
    returns: { "1h": -0.5, "4h": -0.7, "24h": -1.1 },
    pairingLagMinutes: 5,
  };
  return { ...base, ...opts, v1: { ...base.v1, ...(opts?.v1 ?? {}) }, v2: { ...base.v2, ...(opts?.v2 ?? {}) }, returns: { ...base.returns, ...(opts?.returns ?? {}) } };
}

const tests: Array<[string, () => void]> = [
  ["30페어 미만이면 승자 판정을 보류한다", () => {
    const result = compareHorizon(Array.from({length:10},(_,i)=>pair(i)), "1h");
    assert.equal(result.winner, "inconclusive");
  }],
  ["V2 WAIT가 이후 하락을 피하면 avoided bad entry로 집계한다", () => {
    const result = compareHorizon(Array.from({length:5},(_,i)=>pair(i)), "1h");
    assert.equal(result.v2Wait.avoidedBadEntry, 5);
    assert.equal(result.v2Wait.missedOpportunity, 0);
  }],
  ["충분한 표본에서 V2 방향 정확도와 수익이 함께 우세하면 V2 승리", () => {
    const pairs = Array.from({length:40},(_,i)=>pair(i,{
      v1:{ direction:"bullish", action:"buy" } as any,
      v2:{ direction:"bearish", action:"sell", overheatRisk:20, preferredEntry:"trend_continuation" } as any,
      returns:{"1h":-0.6,"4h":-0.8,"24h":-1.0},
    }));
    const result = compareHorizon(pairs, "1h");
    assert.equal(result.winner, "v2");
  }],
  ["Regime/Overheat/News 세그먼트를 별도로 만든다", () => {
    const pairs=Array.from({length:3},(_,i)=>pair(i));
    const result=buildPerformanceBattle(pairs,{candidateV2Snapshots:3,excludedLaggedPairs:0,maxPairingLagMinutes:15});
    assert.equal(result.regimes[0]?.segment,"strong_bull_trend");
    assert.equal(result.v2Diagnostics.overheatGuard?.pairs,3);
    assert.equal(result.v2Diagnostics.newsLimited?.pairs,3);
  }],
];

for (const [name, fn] of tests) {
  try { fn(); console.log(`[PASS] ${name}`); }
  catch (error) { console.error(`[FAIL] ${name}`); throw error; }
}
