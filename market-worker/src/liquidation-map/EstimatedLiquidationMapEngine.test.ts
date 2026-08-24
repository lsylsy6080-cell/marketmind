import assert from "node:assert/strict";
import {buildEstimatedLiquidationMap,estimateLiquidationPrice} from "./EstimatedLiquidationMapEngine";

const long10=estimateLiquidationPrice({entryPrice:100000,side:"long",leverage:10});
const short10=estimateLiquidationPrice({entryPrice:100000,side:"short",leverage:10});
assert.ok(long10<100000);
assert.ok(short10>100000);
console.log("[PASS] LONG/SHORT liquidation 방향");

const map=buildEstimatedLiquidationMap({
  currentPrice:100000,
  clusters:[
    {centerPrice:98000,longIntensity:90,shortIntensity:0,confidence:80,estimatedNewLongOiUsd:100_000_000,estimatedNewShortOiUsd:0},
    {centerPrice:102000,longIntensity:0,shortIntensity:85,confidence:75,estimatedNewLongOiUsd:0,estimatedNewShortOiUsd:80_000_000},
  ],
});
assert.ok(map.longZones.length>0);
assert.ok(map.shortZones.length>0);
assert.ok(map.strongestLongZone);
assert.ok(map.strongestShortZone);
console.log("[PASS] Position Cluster → LONG/SHORT liquidation zones");

assert.ok(map.longZones.every(z=>z.intensity>=0&&z.intensity<=100));
assert.ok(map.shortZones.every(z=>z.intensity>=0&&z.intensity<=100));
console.log("[PASS] liquidation intensity 0~100");
