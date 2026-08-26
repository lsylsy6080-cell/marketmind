import { createBitcoinFlash } from "./news-flash-editor";
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("강세장 초기 국면 기사를 시장 사이클 속보로 추출",()=>{
 const r=createBitcoinFlash("Bitcoin enters ‘initial phase’ of new bull market, but $83K remains key: CryptoQuant");
 if(!r.extracted||!r.headline.includes("강세장")||!r.headline.includes("$83K"))throw new Error(r.headline);
});
test("기술적 돌파 전망 기사를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin Breakout Could Be Around the Corner as Asset Is No Longer Oversold");
 if(!r.extracted||!r.headline.includes("돌파"))throw new Error(r.headline);
});
test("기업 BTC 매수 기사를 추출",()=>{
 const r=createBitcoinFlash("Strive Buys $81.5 Million in Bitcoin After Issuing More Shares");
 if(!r.extracted||!r.headline.includes("Strive")||!r.headline.includes("매수"))throw new Error(r.headline);
});
test("ETF 규정 초안 기사를 규제 속보로 추출",()=>{
 const r=createBitcoinFlash("Thailand moves closer to Bitcoin, Ether ETFs with draft rules");
 if(!r.extracted||!r.headline.includes("태국")||!r.headline.includes("ETF"))throw new Error(r.headline);
});
test("금·국채금리 연동 BTC 기사를 거시 속보로 추출",()=>{
 const r=createBitcoinFlash("Bitcoin slips from $80K as gold cools with falling US bond yields");
 if(!r.extracted||r.category!=="macro")throw new Error(r.headline);
});
test("BTC 담보대출 서비스 기사를 추출",()=>{
 const r=createBitcoinFlash("Galaxy expands retail crypto lending with new BTC, ETH and SOL-backed credit line");
 if(!r.extracted||!r.headline.includes("담보 대출"))throw new Error(r.headline);
});
test("은행의 BTC 거래 제한 기사를 추출",()=>{
 const r=createBitcoinFlash("UK Banks Still Blocking Bitcoin, Policy Group Tells Parliament");
 if(!r.extracted||!r.headline.includes("영국")||!r.headline.includes("제한"))throw new Error(r.headline);
});
