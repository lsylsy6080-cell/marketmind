import { evaluateContextPerformance } from "./ContextPerformanceMonitor";
import type { ContextOutcomeSample } from "./types";

function test(n:string,f:()=>void){try{f();console.log(`[PASS] ${n}`)}catch(e){console.error(`[FAIL] ${n}`);throw e}}
const sample=(label:ContextOutcomeSample["label"],q=70,r=0.5):ContextOutcomeSample=>({label,qualityScore:q,directionalReturnPercent:r,permission:"allowed"});

test("표본 30개 미만은 collecting",()=>{const r=evaluateContextPerformance(Array.from({length:10},()=>sample("good_entry")));if(r.status!=="collecting")throw new Error("collecting")});
test("충분한 고성과 표본은 healthy",()=>{const s=[...Array.from({length:22},()=>sample("good_entry",75)),...Array.from({length:8},()=>sample("bad_entry",35,-0.5))];const r=evaluateContextPerformance(s);if(r.status!=="healthy"||!r.successRate||r.successRate<65)throw new Error("healthy")});
test("성공률 50~65 구간은 caution",()=>{const s=[...Array.from({length:17},()=>sample("good_entry",65)),...Array.from({length:13},()=>sample("bad_entry",40,-0.4))];const r=evaluateContextPerformance(s);if(r.status!=="caution")throw new Error("caution")});
test("성공률 50 미만은 degraded",()=>{const s=[...Array.from({length:12},()=>sample("good_entry",60)),...Array.from({length:18},()=>sample("bad_entry",30,-0.6))];const r=evaluateContextPerformance(s);if(r.status!=="degraded")throw new Error("degraded")});
test("8-8에서는 어떤 성과에서도 자동 튜닝을 허용하지 않는다",()=>{const s=Array.from({length:40},()=>sample("good_entry",90));const r=evaluateContextPerformance(s);if(r.autoTuningAllowed!==false)throw new Error("auto tuning")});
