import { createBitcoinFlash } from "./news-flash-editor";
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("고래 거래소 이동을 속보로 추출",()=>{
 const r=createBitcoinFlash("Bitcoin whale moves 1,250 BTC to Binance");
 if(!r.extracted||r.category!=="whale"||!r.headline.includes("1,250 BTC"))throw new Error(r.headline);
});
test("미결제약정 증가 뉴스를 파생상품 속보로 추출",()=>{
 const r=createBitcoinFlash("Bitcoin open interest surges to $40 billion");
 if(!r.extracted||r.category!=="derivatives"||!r.headline.includes("미결제약정"))throw new Error(r.headline);
});
test("스테이블코인 신규 발행을 유동성 속보로 추출",()=>{
 const r=createBitcoinFlash("Tether mints $1 billion USDT as crypto liquidity grows");
 if(!r.extracted||r.category!=="stablecoin"||!r.headline.includes("신규 발행"))throw new Error(r.headline);
});
test("채굴 해시레이트 뉴스를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin hashrate rises to new record high");
 if(!r.extracted||r.category!=="mining"||!r.headline.includes("해시레이트"))throw new Error(r.headline);
});
test("보안 사고 뉴스를 추출",()=>{
 const r=createBitcoinFlash("Crypto exchange hacked for $80 million in latest exploit");
 if(!r.extracted||r.category!=="security"||!r.headline.includes("보안 사고"))throw new Error(r.headline);
});
test("거시경제 물가 지표를 BTC 영향 속보로 추출",()=>{
 const r=createBitcoinFlash("US CPI inflation comes in hotter than expected as Bitcoin traders react");
 if(!r.extracted||r.category!=="macro"||!r.headline.includes("물가 지표"))throw new Error(r.headline);
});
test("시장 목표가 전망 뉴스를 추출",()=>{
 const r=createBitcoinFlash("Analyst predicts Bitcoin could reach $100,000 this year");
 if(!r.extracted||!r.headline.includes("$100,000"))throw new Error(r.headline);
});
