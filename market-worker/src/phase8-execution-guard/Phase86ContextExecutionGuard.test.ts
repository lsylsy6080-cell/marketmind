import { evaluateContextExecutionGuard } from "./ContextExecutionGuard";
import type { Phase86ExecutionGuardInput } from "./types";
function test(n:string,f:()=>void){try{f();console.log(`[PASS] ${n}`)}catch(e){console.error(`[FAIL] ${n}`);throw e}}
const base:Phase86ExecutionGuardInput={side:"long",activationAction:"buy",activationPermission:"allowed",activationEntryQualityScore:75,activationApplied:false,blockedByContext:false,activationAgeMinutes:1};
test("LONG + BUY activation은 진입을 허용한다",()=>{const r=evaluateContextExecutionGuard(base);if(!r.sideAllowed||r.marginMultiplier!==1)throw new Error("allow")});
test("Context blocked는 실제 Adaptive 진입을 차단한다",()=>{const r=evaluateContextExecutionGuard({...base,activationPermission:"blocked",blockedByContext:true});if(r.permission!=="blocked"||r.marginMultiplier!==0)throw new Error("block")});
test("방향이 충돌하면 진입을 차단한다",()=>{const r=evaluateContextExecutionGuard({...base,activationAction:"sell"});if(r.sideAllowed)throw new Error("direction")});
test("caution은 진입을 허용하되 margin을 50%로 축소한다",()=>{const r=evaluateContextExecutionGuard({...base,activationPermission:"caution"});if(r.permission!=="reduced"||r.marginMultiplier!==0.5)throw new Error("reduce")});
test("5분 초과 activation snapshot은 stale로 차단한다",()=>{const r=evaluateContextExecutionGuard({...base,activationAgeMinutes:6});if(r.permission!=="blocked")throw new Error("stale")});
