import assert from "node:assert/strict";import {calculateSqueezeProbability} from "./SqueezeProbabilityEngine";
const base={currentPrice:100000,oiChange5mPercent:-.7,liquidationState:"quiet",liquidationBias:"neutral",liquidationConfidence:30,longLiquidationUsd:0,shortLiquidationUsd:0,dataReliability:90};
const long=calculateSqueezeProbability({...base,priceChange5mPercent:-.8,takerBuyRatio:.35,longZones:[{centerPrice:99000,intensity:95,confidence:85}],shortZones:[{centerPrice:105000,intensity:40,confidence:60}]});
assert.ok(long.longSqueeze.probability>long.shortSqueeze.probability);console.log("[PASS] 하락압력 + 근접 LONG 청산구간 → Long Squeeze 위험 우세");
const short=calculateSqueezeProbability({...base,priceChange5mPercent:.9,takerBuyRatio:.67,longZones:[{centerPrice:95000,intensity:30,confidence:55}],shortZones:[{centerPrice:101000,intensity:92,confidence:88}]});
assert.ok(short.shortSqueeze.probability>short.longSqueeze.probability);console.log("[PASS] 상승압력 + 근접 SHORT 청산구간 → Short Squeeze 위험 우세");
assert.ok(short.shortSqueeze.probability>=0&&short.shortSqueeze.probability<=100);console.log("[PASS] probability 0~100");
