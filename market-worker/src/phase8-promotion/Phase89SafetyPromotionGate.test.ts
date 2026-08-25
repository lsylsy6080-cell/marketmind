import { evaluateSafetyPromotion } from "./SafetyPromotionGate";
import type { Phase89PromotionInput } from "./types";

function test(n:string,f:()=>void){try{f();console.log(`[PASS] ${n}`)}catch(e){console.error(`[FAIL] ${n}`);throw e}}
const base:Phase89PromotionInput={
  sampleCount:40,decisiveSampleCount:30,successRate:70,averageQualityScore:68,
  avoidedLossCount:8,missedOpportunityCount:3,performanceStatus:"healthy",
};

test("표본 부족이면 collecting으로 유지",()=>{const r=evaluateSafetyPromotion({...base,sampleCount:20,decisiveSampleCount:15});if(r.status!=="collecting"||r.eligible)throw new Error("collecting")});
test("healthy + 충분한 성과는 튜닝 후보로 승격",()=>{const r=evaluateSafetyPromotion(base);if(r.status!=="eligible_for_tuning"||!r.eligible)throw new Error("eligible")});
test("성공률 65% 미만은 승격 금지",()=>{const r=evaluateSafetyPromotion({...base,successRate:64});if(r.status!=="not_eligible"||r.eligible)throw new Error("success")});
test("missed opportunity 과다는 승격 금지",()=>{const r=evaluateSafetyPromotion({...base,avoidedLossCount:2,missedOpportunityCount:6});if(r.eligible)throw new Error("missed")});
test("8-9 통과 후에도 자동 적용은 허용하지 않는다",()=>{const r=evaluateSafetyPromotion(base);if(r.autoApplyAllowed!==false)throw new Error("auto apply")});
