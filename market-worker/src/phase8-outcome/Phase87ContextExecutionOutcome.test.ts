import { evaluateContextExecutionOutcome } from "./ContextExecutionOutcome";
import type { Phase87OutcomeInput } from "./types";

function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}
const base:Phase87OutcomeInput={side:"long",permission:"allowed",marginMultiplier:1,referencePrice:100,futurePrice:101,horizonMinutes:15};

test("허용 LONG 이후 상승은 good_entry",()=>{const r=evaluateContextExecutionOutcome(base);if(r.label!=="good_entry"||r.directionalReturnPercent<=0)throw new Error("good")});
test("허용 LONG 이후 하락은 bad_entry",()=>{const r=evaluateContextExecutionOutcome({...base,futurePrice:99});if(r.label!=="bad_entry")throw new Error("bad")});
test("차단 LONG 이후 하락은 avoided_loss",()=>{const r=evaluateContextExecutionOutcome({...base,permission:"blocked",futurePrice:99});if(r.label!=="avoided_loss")throw new Error("avoid")});
test("차단 LONG 이후 상승은 missed_opportunity",()=>{const r=evaluateContextExecutionOutcome({...base,permission:"blocked",futurePrice:101});if(r.label!=="missed_opportunity")throw new Error("miss")});
test("SHORT 수익률은 가격 하락을 양수로 평가한다",()=>{const r=evaluateContextExecutionOutcome({...base,side:"short",futurePrice:99});if(r.directionalReturnPercent<=0||r.label!=="good_entry")throw new Error("short")});
