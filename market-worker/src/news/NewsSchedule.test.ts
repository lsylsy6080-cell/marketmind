import { resolveNewsIntervalMinutes, shouldRunNewsCycle } from "./news-schedule";

function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("환경변수가 없으면 뉴스 주기는 기본 10분",()=>{if(resolveNewsIntervalMinutes(undefined)!==10)throw new Error("default")});
test("5분 미만 설정은 5분으로 제한",()=>{if(resolveNewsIntervalMinutes("2")!==5)throw new Error("min")});
test("60분 초과 설정은 60분으로 제한",()=>{if(resolveNewsIntervalMinutes("120")!==60)throw new Error("max")});
test("부팅 cycle에서는 즉시 뉴스 실행",()=>{if(!shouldRunNewsCycle({initial:true,now:1000,lastRunAt:900,intervalMinutes:10}))throw new Error("boot")});
test("일반 cycle은 설정 주기가 지난 뒤에만 실행",()=>{const last=1_000_000;if(shouldRunNewsCycle({initial:false,now:last+9*60_000,lastRunAt:last,intervalMinutes:10}))throw new Error("early");if(!shouldRunNewsCycle({initial:false,now:last+10*60_000,lastRunAt:last,intervalMinutes:10}))throw new Error("due")});
