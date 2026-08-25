import { buildAdaptiveContextTuningCandidate } from "./AdaptiveContextTuner";
import type { Phase810TuningInput } from "./types";

function test(n:string,f:()=>void){try{f();console.log(`[PASS] ${n}`)}catch(e){console.error(`[FAIL] ${n}`);throw e}}
const base:Phase810TuningInput={
  promotionEligible:true,performanceStatus:"healthy",successRate:72,averageQualityScore:68,
  avoidedLossCount:8,missedOpportunityCount:3,
  current:{minimumSuccessRate:65,minimumAverageQualityScore:60,cautionMarginMultiplier:0.5},
};

test("Promotion 미통과면 후보 생성 차단",()=>{const r=buildAdaptiveContextTuningCandidate({...base,promotionEligible:false});if(r.status!=="blocked")throw new Error("blocked")});
test("healthy + eligible이면 candidate_ready",()=>{const r=buildAdaptiveContextTuningCandidate(base);if(r.status!=="candidate_ready")throw new Error("ready")});
test("고성과에서는 threshold를 소폭 강화",()=>{const r=buildAdaptiveContextTuningCandidate({...base,successRate:78,averageQualityScore:75});if(r.candidate.minimumSuccessRate<=65||r.candidate.minimumAverageQualityScore<=60)throw new Error("strengthen")});
test("missed opportunity가 많으면 caution margin을 최대 +0.05 완화",()=>{const r=buildAdaptiveContextTuningCandidate({...base,avoidedLossCount:2,missedOpportunityCount:7});if(r.deltas.cautionMarginMultiplier!==0.05)throw new Error("margin")});
test("8-10 후보는 어떤 경우에도 자동 적용하지 않는다",()=>{const r=buildAdaptiveContextTuningCandidate(base);if(r.autoApplyAllowed!==false)throw new Error("auto")});
