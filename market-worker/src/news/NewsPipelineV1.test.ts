import { buildEventFingerprint, calculateBtcRelevance, impactLevel, normalizeNewsText } from "./news-pipeline-utils";
function test(name:string, fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}
test("HTML/공백을 정리한다",()=>{if(normalizeNewsText("<b>Bitcoin</b>   rises")!=="Bitcoin rises")throw new Error("normalize")});
test("BTC 직접 뉴스는 높은 관련도로 계산한다",()=>{if(calculateBtcRelevance("Bitcoin ETF inflows surge","BTC demand rises")<60)throw new Error("relevance")});
test("타 알트코인 단독 뉴스는 BTC 관련도를 낮춘다",()=>{if(calculateBtcRelevance("Solana upgrade","SOL validators")>20)throw new Error("alt")});
test("유사 제목은 안정적인 이벤트 fingerprint를 만든다",()=>{const a=buildEventFingerprint("Bitcoin ETF inflows surge after Fed decision");const b=buildEventFingerprint("Fed decision: Bitcoin ETF inflows surge");if(a!==b)throw new Error("fingerprint")});
test("중요도와 관련도가 높으면 high impact",()=>{if(impactLevel(9,90)!=="high")throw new Error("impact")});
