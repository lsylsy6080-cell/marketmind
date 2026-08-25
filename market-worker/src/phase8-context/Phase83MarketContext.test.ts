import assert from "node:assert/strict";
import { buildMarketContext } from "./MarketContextEngine";
import type { Phase83ContextInput } from "./types";

const now="2026-08-25T00:00:00.000Z";
function input(overrides?:Partial<Phase83ContextInput>):Phase83ContextInput{
 const base:Phase83ContextInput={
  structure:{symbol:"BTCUSDT",calculatedAt:now,currentPrice:100,nearestSupport:{price:98,strength:80,distancePercent:2,kind:"support",sources:["1h"]},nearestResistance:{price:106,strength:55,distancePercent:6,kind:"resistance",sources:["4h"]}},
  correlation:{symbol:"BTCUSDT",calculatedAt:now,overallCorrelation:0.92,overallDivergenceScore:12,state:"synchronized",riskLevel:"low"}
 };
 return {...base,...overrides};
}
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`);}catch(e){console.error(`[FAIL] ${name}`);throw e;}}

test("강한 지지와 넓은 상방 여유 + 동조 시장은 LONG favorable",()=>{const r=buildMarketContext(input());assert.equal(r.preferredDirection,"long");assert.equal(r.permission,"favorable");assert.ok(r.contextScore>65);});
test("강한 저항과 넓은 하방 여유는 SHORT 우세",()=>{const r=buildMarketContext(input({structure:{symbol:"BTCUSDT",calculatedAt:now,currentPrice:100,nearestSupport:{price:94,strength:50,distancePercent:6,kind:"support",sources:["4h"]},nearestResistance:{price:101.5,strength:85,distancePercent:1.5,kind:"resistance",sources:["1h"]}}}));assert.equal(r.preferredDirection,"short");assert.equal(r.permission,"favorable");});
test("지지/저항이 동시에 가까우면 compressed + caution",()=>{const r=buildMarketContext(input({structure:{symbol:"BTCUSDT",calculatedAt:now,currentPrice:100,nearestSupport:{price:99.6,strength:70,distancePercent:0.4,kind:"support",sources:["15m"]},nearestResistance:{price:100.5,strength:70,distancePercent:0.5,kind:"resistance",sources:["15m"]}}}));assert.equal(r.structureState,"compressed");assert.equal(r.permission,"caution");assert.equal(r.preferredDirection,"neutral");});
test("Spot/Futures decoupled + high risk는 구조가 좋아도 진입 회피",()=>{const r=buildMarketContext(input({correlation:{symbol:"BTCUSDT",calculatedAt:now,overallCorrelation:0.2,overallDivergenceScore:88,state:"decoupled",riskLevel:"high"}}));assert.equal(r.permission,"avoid");assert.equal(r.preferredDirection,"neutral");assert.ok(r.riskScore>=70);});
test("결과는 8-3 전략 버전과 소스 시각을 보존한다",()=>{const r=buildMarketContext(input(),new Date("2026-08-25T01:00:00.000Z"));assert.equal(r.strategyVersion,"phase8-market-context-v8.3");assert.equal(r.sourceCalculatedAt.structure,now);assert.equal(r.sourceCalculatedAt.correlation,now);assert.equal(r.calculatedAt,"2026-08-25T01:00:00.000Z");});
