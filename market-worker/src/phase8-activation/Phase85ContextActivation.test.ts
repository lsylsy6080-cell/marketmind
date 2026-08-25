import { applyContextActivation } from "./ContextActivationEngine";
import type { Phase85ActivationInput } from "./types";

function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}
const base:Phase85ActivationInput={baseAction:"strong_buy",baseTradingPermission:"allowed",gatePermission:"pass",alignment:"aligned",shadowAction:"strong_buy",shadowEntryQualityScore:78,gateConfidence:75,contextRiskScore:25,mode:"guarded"};

test("PASS는 기존 Decision V2를 공격적으로 변경하지 않는다",()=>{const r=applyContextActivation(base);if(r.effectiveAction!=="strong_buy"||r.applied)throw new Error("pass")});
test("BLOCKED는 실제 적용값을 WAIT/blocked로 제한한다",()=>{const r=applyContextActivation({...base,gatePermission:"blocked",shadowAction:"wait"});if(r.effectiveAction!=="wait"||r.effectiveTradingPermission!=="blocked"||!r.blockedByContext)throw new Error("blocked")});
test("CAUTION은 shadow action을 실제 보수값으로 적용한다",()=>{const r=applyContextActivation({...base,gatePermission:"caution",shadowAction:"buy"});if(r.effectiveAction!=="buy"||r.effectiveTradingPermission!=="caution")throw new Error("caution")});
test("고위험 Context는 PASS라도 추가 보수화한다",()=>{const r=applyContextActivation({...base,contextRiskScore:85});if(r.effectiveTradingPermission!=="caution"||r.effectiveAction!=="buy")throw new Error("risk")});
test("shadow mode는 기존 action/permission을 변경하지 않는다",()=>{const r=applyContextActivation({...base,mode:"shadow",gatePermission:"blocked",shadowAction:"wait"});if(r.effectiveAction!=="strong_buy"||r.effectiveTradingPermission!=="allowed"||r.applied)throw new Error("shadow")});
