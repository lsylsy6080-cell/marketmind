import { evaluateAutoRollbackProtection } from "./AutoRollbackProtection";
import type { Phase811RollbackInput, RollbackPerformancePoint } from "./types";

function test(n:string,f:()=>void){try{f();console.log(`[PASS] ${n}`)}catch(e){console.error(`[FAIL] ${n}`);throw e}}

const baseline:RollbackPerformancePoint={
  sampleCount:40,successRate:72,averageQualityScore:68,
  missedOpportunityCount:3,avoidedLossCount:8,status:"healthy",
};
const current:RollbackPerformancePoint={
  sampleCount:25,successRate:70,averageQualityScore:66,
  missedOpportunityCount:3,avoidedLossCount:7,status:"healthy",
};
const base:Phase811RollbackInput={tuningApplied:true,baseline,current};

test("실제 튜닝 미적용이면 not_armed",()=>{const r=evaluateAutoRollbackProtection({...base,tuningApplied:false});if(r.status!=="not_armed"||r.rollbackRecommended)throw new Error("not armed")});
test("적용 후 표본 20개 미만은 monitoring",()=>{const r=evaluateAutoRollbackProtection({...base,current:{...current,sampleCount:12}});if(r.status!=="monitoring")throw new Error("monitoring")});
test("성공률이 10%p 이상 하락하면 rollback_required",()=>{const r=evaluateAutoRollbackProtection({...base,current:{...current,successRate:60}});if(r.status!=="rollback_required"||!r.rollbackRecommended)throw new Error("success drop")});
test("품질점수가 8 이상 하락하면 rollback_required",()=>{const r=evaluateAutoRollbackProtection({...base,current:{...current,averageQualityScore:59}});if(!r.rollbackRecommended)throw new Error("quality drop")});
test("성과가 유지되면 stable이며 자동 rollback은 금지",()=>{const r=evaluateAutoRollbackProtection(base);if(r.status!=="stable"||r.autoRollbackAllowed!==false)throw new Error("stable")});
