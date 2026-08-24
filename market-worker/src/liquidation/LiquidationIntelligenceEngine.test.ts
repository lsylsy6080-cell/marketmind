import assert from "node:assert/strict";
import { classifyLiquidationWindow } from "./LiquidationIntelligenceEngine";

const squeeze=classifyLiquidationWindow({
  longLiquidationUsd:100_000,shortLiquidationUsd:900_000,
  firstPrice:100000,lastPrice:101200,recentMedianTotalUsd:300_000,streamHealthy:true,
});
assert.equal(squeeze.state,"short_squeeze");
assert.ok(squeeze.overheatAdjustment>0);
assert.ok(squeeze.entryAdjustment<0);
console.log("[PASS] SHORT liquidation + 가격상승 = short squeeze");

const flush=classifyLiquidationWindow({
  longLiquidationUsd:1_200_000,shortLiquidationUsd:100_000,
  firstPrice:100000,lastPrice:98600,recentMedianTotalUsd:400_000,streamHealthy:true,
});
assert.equal(flush.state,"long_flush");
assert.equal(flush.directionalBias,"bearish");
console.log("[PASS] LONG liquidation + 가격하락 = long flush");

const mixed=classifyLiquidationWindow({
  longLiquidationUsd:900_000,shortLiquidationUsd:800_000,
  firstPrice:100000,lastPrice:100100,recentMedianTotalUsd:500_000,streamHealthy:true,
});
assert.equal(mixed.state,"mixed_cascade");
assert.ok(mixed.reversalAdjustment>0);
console.log("[PASS] 양방향 대량청산 = mixed cascade");

const stale=classifyLiquidationWindow({
  longLiquidationUsd:1_000_000,shortLiquidationUsd:0,
  firstPrice:100000,lastPrice:99000,recentMedianTotalUsd:200_000,streamHealthy:false,
});
assert.equal(stale.state,"insufficient_data");
assert.equal(stale.entryAdjustment,0);
console.log("[PASS] 스트림 불안정 시 보정 차단");
