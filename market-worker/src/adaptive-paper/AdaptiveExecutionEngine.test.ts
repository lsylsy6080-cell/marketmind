import assert from "node:assert/strict";
import {
  buildAdaptiveExecutionPlan,
  determineAdaptiveCloseReason,
  estimateLiquidationPrice,
  evaluateLiquidationSafety,
  evaluateAdaptiveSqueezeEntryGuard,
  evaluateAdaptiveSqueezeProtection,
} from "./AdaptiveExecutionEngine";

const longPlan=buildAdaptiveExecutionPlan({
  side:"long",marketPrice:100000,invalidationPrice:98000,
  marginPercent:10,leverage:4,accountEquity:10000,
});
assert.equal(longPlan.marginAmount,1000);
assert.equal(longPlan.notionalAmount,4000);
assert.equal(longPlan.stopDistancePercent,2);
assert.equal(longPlan.takeProfitPrice,103000);
assert.equal(longPlan.requestedLeverage,4);
assert.equal(longPlan.leverage,4);
assert.equal(longPlan.liquidationSafetyStatus,"safe");
console.log("[PASS] 안전한 레버리지는 그대로 유지한다");

const liq4x=estimateLiquidationPrice({
  side:"long",entryPrice:100000,leverage:4,maintenanceMarginRatePercent:0.5,
});
assert.ok(liq4x < 98000);
console.log("[PASS] LONG 예상 청산가는 손절가 아래에 위치한다");

const adjusted=evaluateLiquidationSafety({
  side:"long",entryPrice:100000,stopLossPrice:85000,
  requestedLeverage:6,maintenanceMarginRatePercent:0.5,safetyBufferPercent:2,
});
assert.ok(adjusted.appliedLeverage < 6);
assert.equal(adjusted.status,"adjusted");
console.log("[PASS] 손절폭이 넓으면 레버리지를 자동 하향한다");

const shortSafety=evaluateLiquidationSafety({
  side:"short",entryPrice:100000,stopLossPrice:104000,
  requestedLeverage:5,maintenanceMarginRatePercent:0.5,safetyBufferPercent:1,
});
assert.ok(shortSafety.estimatedLiquidationPrice > 104000);
assert.ok(shortSafety.liquidationDistancePercent >= shortSafety.minimumRequiredDistancePercent);
console.log("[PASS] SHORT도 손절가 위에 충분한 청산 안전거리를 확보한다");

assert.equal(determineAdaptiveCloseReason({
  side:"long",marketPrice:97900,entryPrice:100000,stopLossPrice:98000,takeProfitPrice:103000,
  openedAt:new Date().toISOString(),maxHoldingMinutes:120,currentDirection:"bullish",triggerStatus:"READY"
}),"stop_loss");
console.log("[PASS] LONG 손절 가격을 감지한다");

assert.equal(determineAdaptiveCloseReason({
  side:"short",marketPrice:97000,entryPrice:100000,stopLossPrice:102000,takeProfitPrice:97000,
  openedAt:new Date().toISOString(),maxHoldingMinutes:120,currentDirection:"bearish",triggerStatus:"READY"
}),"take_profit");
console.log("[PASS] SHORT 익절 가격을 감지한다");

assert.equal(determineAdaptiveCloseReason({
  side:"long",marketPrice:100200,entryPrice:100000,stopLossPrice:98000,takeProfitPrice:103000,
  openedAt:new Date().toISOString(),maxHoldingMinutes:120,currentDirection:"bullish",triggerStatus:"INVALIDATED"
}),"trigger_invalidated");
console.log("[PASS] Entry Trigger INVALIDATED를 청산 조건으로 사용한다");


const longActiveProtection=evaluateAdaptiveSqueezeProtection({
  side:"long",
  marketPrice:99000,
  entryPrice:100000,
  currentStopLossPrice:97000,
  warning:{
    snapshotId:1,observedAt:new Date().toISOString(),
    longPhase:"ACTIVE",shortPhase:"WATCH",
    longAlertScore:88,shortAlertScore:10,
  },
});
assert.equal(longActiveProtection.action,"close");
assert.equal(longActiveProtection.relevantPhase,"ACTIVE");
console.log("[PASS] LONG 보유 중 Long Squeeze ACTIVE → 방어적 청산");

const longImminentProtection=evaluateAdaptiveSqueezeProtection({
  side:"long",
  marketPrice:101000,
  entryPrice:100000,
  currentStopLossPrice:97000,
  warning:{
    snapshotId:2,observedAt:new Date().toISOString(),
    longPhase:"IMMINENT",shortPhase:"WATCH",
    longAlertScore:78,shortAlertScore:12,
  },
});
assert.equal(longImminentProtection.action,"tighten_stop");
assert.ok((longImminentProtection.newStopLossPrice??0)>97000);
assert.ok((longImminentProtection.newStopLossPrice??Infinity)<101000);
console.log("[PASS] Long Squeeze IMMINENT → 손절가를 시장가 쪽으로 강화");

const adverseEntry=evaluateAdaptiveSqueezeEntryGuard({
  side:"long",
  warning:{
    snapshotId:3,observedAt:new Date().toISOString(),
    longPhase:"IMMINENT",shortPhase:"WATCH",
    longAlertScore:80,shortAlertScore:10,
  },
});
assert.equal(adverseEntry.allowed,false);
console.log("[PASS] 신규 LONG에서 Long Squeeze IMMINENT → 진입 차단");

const chaseEntry=evaluateAdaptiveSqueezeEntryGuard({
  side:"long",
  warning:{
    snapshotId:4,observedAt:new Date().toISOString(),
    longPhase:"WATCH",shortPhase:"ACTIVE",
    longAlertScore:10,shortAlertScore:90,
  },
});
assert.equal(chaseEntry.allowed,false);
console.log("[PASS] Short Squeeze ACTIVE 중 신규 LONG 추격 → 진입 차단");

const buildingEntry=evaluateAdaptiveSqueezeEntryGuard({
  side:"short",
  warning:{
    snapshotId:5,observedAt:new Date().toISOString(),
    longPhase:"WATCH",shortPhase:"BUILDING",
    longAlertScore:10,shortAlertScore:65,
  },
});
assert.equal(buildingEntry.allowed,true);
assert.ok(buildingEntry.marginMultiplier<1);
console.log("[PASS] Squeeze BUILDING → 진입 허용하되 margin 축소");
