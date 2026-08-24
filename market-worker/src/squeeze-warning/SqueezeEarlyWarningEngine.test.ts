import assert from "node:assert/strict";
import { calculateSqueezeEarlyWarning } from "./SqueezeEarlyWarningEngine";

const history = [
  { probability: 40, triggerPressure: 35, liquidationConfirmation: 15, nearestZoneIntensity: 55, calculatedAt: "2026-08-24T02:00:00Z" },
  { probability: 56, triggerPressure: 48, liquidationConfirmation: 25, nearestZoneIntensity: 70, calculatedAt: "2026-08-24T02:01:00Z" },
  { probability: 68, triggerPressure: 58, liquidationConfirmation: 30, nearestZoneIntensity: 82, calculatedAt: "2026-08-24T02:02:00Z" },
];

const imminent = calculateSqueezeEarlyWarning({
  currentPrice: 100000,
  longSqueeze: {
    current: { probability: 76, triggerPressure: 65, liquidationConfirmation: 35, nearestZoneIntensity: 90, calculatedAt: "2026-08-24T02:03:00Z" },
    history,
    previousPhase: "BUILDING",
    liquidationState: "quiet",
    liquidationConfidence: 30,
  },
  shortSqueeze: {
    current: { probability: 20, triggerPressure: 10, liquidationConfirmation: 5, nearestZoneIntensity: 20, calculatedAt: "2026-08-24T02:03:00Z" },
    history: [],
    previousPhase: "WATCH",
    liquidationState: "quiet",
    liquidationConfidence: 20,
  },
});
assert.equal(imminent.longSqueeze.phase, "IMMINENT");
console.log("[PASS] 확률 상승 + 청산구간 압력 누적 → IMMINENT");

const active = calculateSqueezeEarlyWarning({
  currentPrice: 100000,
  longSqueeze: {
    current: { probability: 70, triggerPressure: 70, liquidationConfirmation: 80, nearestZoneIntensity: 88, calculatedAt: "2026-08-24T02:04:00Z" },
    history,
    previousPhase: "IMMINENT",
    liquidationState: "long_flush",
    liquidationConfidence: 85,
  },
  shortSqueeze: {
    current: { probability: 15, triggerPressure: 5, liquidationConfirmation: 5, nearestZoneIntensity: 10, calculatedAt: "2026-08-24T02:04:00Z" },
    history: [],
    previousPhase: "WATCH",
    liquidationState: "quiet",
    liquidationConfidence: 20,
  },
});
assert.equal(active.longSqueeze.phase, "ACTIVE");
console.log("[PASS] 실제 LONG liquidation 확인 → ACTIVE");

const exhausted = calculateSqueezeEarlyWarning({
  currentPrice: 100000,
  longSqueeze: {
    current: { probability: 38, triggerPressure: 18, liquidationConfirmation: 15, nearestZoneIntensity: 40, calculatedAt: "2026-08-24T02:05:00Z" },
    history,
    previousPhase: "ACTIVE",
    liquidationState: "quiet",
    liquidationConfidence: 20,
  },
  shortSqueeze: {
    current: { probability: 20, triggerPressure: 10, liquidationConfirmation: 5, nearestZoneIntensity: 20, calculatedAt: "2026-08-24T02:05:00Z" },
    history: [],
    previousPhase: "WATCH",
    liquidationState: "quiet",
    liquidationConfidence: 20,
  },
});
assert.equal(exhausted.longSqueeze.phase, "EXHAUSTION");
console.log("[PASS] ACTIVE 이후 확률/청산 약화 → EXHAUSTION");
