import { createBitcoinFlash } from "./news-flash-editor";
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}
test("한국어 BTC 돌파 뉴스는 번역 없이 직접 속보화",()=>{const r=createBitcoinFlash("비트코인 8만달러 돌파…ETF 순유입 확대");if(!r.extracted||!r.headline.includes("돌파")||r.headline.includes("[원문]"))throw new Error(r.headline)});
test("한국어 ETF 유입 뉴스 직접 처리",()=>{const r=createBitcoinFlash("비트코인 현물 ETF 순유입 증가, 기관 자금 유입 확대");if(!r.extracted||r.category!=="etf")throw new Error(r.headline)});
test("한국어 거시 뉴스 직접 처리",()=>{const r=createBitcoinFlash("미 국채금리 상승에 비트코인 변동성 확대");if(!r.extracted||r.category!=="macro")throw new Error(r.headline)});
test("한국어 규제 뉴스 직접 처리",()=>{const r=createBitcoinFlash("금융위원회 비트코인 관련 규제안 발표");if(!r.extracted||r.category!=="regulation")throw new Error(r.headline)});
test("한국어 청산 뉴스 직접 처리",()=>{const r=createBitcoinFlash("비트코인 급락에 레버리지 롱 포지션 대규모 청산");if(!r.extracted||r.category!=="liquidation")throw new Error(r.headline)});
test("영문 뉴스 기존 처리 유지",()=>{const r=createBitcoinFlash("Bitcoin breakout could be around the corner as asset is no longer oversold");if(!r.extracted)throw new Error(r.headline)});

test("복합 한국어 뉴스는 가격과 ETF 흐름을 함께 보존",()=>{const r=createBitcoinFlash("비트코인 8만달러 돌파…ETF 순유입 확대");if(!r.headline.includes("돌파")||!r.headline.includes("ETF 순유입"))throw new Error(r.headline)});
