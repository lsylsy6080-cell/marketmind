import { createBitcoinFlash } from "./news-flash-editor";
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("기업 BTC 매수는 문장 고정패턴 없이 주체·수량·보유량을 추출",()=>{
 const r=createBitcoinFlash("Strive acquires 1,110 bitcoin for $81.5 million as total holdings reach 21,356 BTC");
 if(!r.extracted||!r.headline.includes("Strive")||!r.headline.includes("1,110 BTC")||!r.headline.includes("21,356 BTC"))throw new Error(r.headline);
});
test("ETF 규모 확대 기사를 범용 추출",()=>{
 const r=createBitcoinFlash("Bitcoin, Ethereum ETFs Grew $23 Billion Last Week—Only $2.6 Billion Was New Money");
 if(!r.extracted||r.category!=="etf")throw new Error(r.headline);
});
test("유명 투자자 BTC 보유 권고를 추출",()=>{
 const r=createBitcoinFlash("Ray Dalio says investors should own ‘a bit of Bitcoin’ as U.S. debt risks rise");
 if(!r.extracted||!r.headline.includes("Ray Dalio")||!r.headline.includes("보유 권고"))throw new Error(r.headline);
});
test("Jackson Hole 거시 이벤트를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin's Next Test Is $80,000 as Jackson Hole Meeting Looms");
 if(!r.extracted||r.category!=="macro"||!r.headline.includes("잭슨홀"))throw new Error(r.headline);
});
test("숏 청산 동반 BTC 강세를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin Has Its Best Week Since 2023 as Shortsellers Continue To Get Wiped Out");
 if(!r.extracted||r.category!=="liquidation"||!r.headline.includes("숏"))throw new Error(r.headline);
});
test("정보량 낮은 종합기사 제목은 억지 속보화하지 않는다",()=>{
 const r=createBitcoinFlash("Here’s what happened in crypto today");
 if(r.extracted)throw new Error(r.headline);
});
test("한국어 복합 뉴스 처리를 유지",()=>{
 const r=createBitcoinFlash("비트코인 8만달러 돌파…ETF 순유입 확대");
 if(!r.extracted||!r.headline.includes("돌파")||!r.headline.includes("ETF 순유입"))throw new Error(r.headline);
});
