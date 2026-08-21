import assert from "node:assert/strict";
import { calculateAdaptivePositionSizing } from "./AdaptivePositionSizingEngine";

const base={
  accountEquity:10000,triggerStatus:"READY" as const,direction:"bullish" as const,
  entryQualityScore:82,directionStrength:80,regimeConfidence:90,dataReliability:85,
  overheatRisk:20,reversalRisk:20,fundingCrowdingRisk:20,tradingPermission:"allowed" as const,
  stopLossDistancePercent:1.5,
};

const tests:Array<[string,()=>void]>=[
  ["READY가 아니면 증거금과 레버리지를 0으로 차단한다",()=>{
    const r=calculateAdaptivePositionSizing({...base,triggerStatus:"WATCH"});
    assert.equal(r.status,"blocked"); assert.equal(r.marginPercent,0); assert.equal(r.leverage,0);
  }],
  ["좋은 조건에서는 동적 증거금과 레버리지를 계산한다",()=>{
    const r=calculateAdaptivePositionSizing(base);
    assert.equal(r.status,"candidate_ready"); assert.ok(r.marginPercent>=5); assert.ok(r.leverage>=1);
  }],
  ["유효 노출은 초기 안전 상한 1.0x를 넘지 않는다",()=>{
    const r=calculateAdaptivePositionSizing({...base,entryQualityScore:100,directionStrength:100,regimeConfidence:100,dataReliability:100});
    assert.ok(r.effectiveExposureMultiple<=1.000001);
  }],
  ["손절 Risk Budget이 계좌 Risk 상한을 넘지 않게 제한한다",()=>{
    const r=calculateAdaptivePositionSizing({...base,stopLossDistancePercent:8});
    assert.ok(r.estimatedStopLossRiskPercent<=r.maxAccountRiskPercent+0.0001);
  }],
  ["caution 상태는 증거금 7.5%·레버리지 3배 이하로 제한한다",()=>{
    const r=calculateAdaptivePositionSizing({...base,tradingPermission:"caution",entryQualityScore:95,directionStrength:95});
    assert.ok(r.marginPercent<=7.5); assert.ok(r.leverage<=3);
  }],
  ["과열 위험이 높으면 포지션을 축소한다",()=>{
    const cool=calculateAdaptivePositionSizing(base);
    const hot=calculateAdaptivePositionSizing({...base,overheatRisk:80});
    assert.ok(hot.effectiveExposureMultiple<=cool.effectiveExposureMultiple);
  }],
];
for(const [name,fn] of tests){fn();console.log(`[PASS] ${name}`);}
