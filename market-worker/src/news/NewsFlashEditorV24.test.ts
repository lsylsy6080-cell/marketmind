import { createBitcoinFlash } from "./news-flash-editor";
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("국채금리·유가와 BTC 연동 기사를 거시 속보로 추출",()=>{
 const r=createBitcoinFlash("Bitcoin pauses at $64,000 as rising yields, oil drag equities lower");
 if(!r.extracted||r.category!=="macro"||!r.headline.includes("국채금리"))throw new Error(r.headline);
});
test("S&P500 대비 BTC 상대강도 기사를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin scores a rare win over S&P 500 with 2.6% rise versus 0.5% fall");
 if(!r.extracted||!r.headline.includes("S&P500")||!r.headline.includes("상대강도"))throw new Error(r.headline);
});
test("레버리지 롱 청산 위험 기사를 추출",()=>{
 const r=createBitcoinFlash("The bitcoin price level where leveraged bulls could get whacked");
 if(!r.extracted||r.category!=="liquidation"||!r.headline.includes("청산 위험"))throw new Error(r.headline);
});
test("BTC 단독 강세와 알트 약세 기사를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin climbs above $64,000 while most majors slip");
 if(!r.extracted||!r.headline.includes("상대강세"))throw new Error(r.headline);
});
test("Strategy 현금 비축 기사를 기관 속보로 추출",()=>{
 const r=createBitcoinFlash("Saylor says share buyback isn’t priority as Strategy builds $4.8 billion cash reserve");
 if(!r.extracted||r.category!=="institution"||!r.headline.includes("현금 비축"))throw new Error(r.headline);
});
test("Strategy MSTR 자금조달과 BTC 보유 유지 기사를 추출",()=>{
 const r=createBitcoinFlash("Strategy Leaves Bitcoin Untouched, Raises $334M Selling MSTR Stock");
 if(!r.extracted||!r.headline.includes("MSTR")||!r.headline.includes("BTC 보유 유지"))throw new Error(r.headline);
});
test("Strategy·Metaplanet 보유전략 기사를 추출",()=>{
 const r=createBitcoinFlash("Bitcoin's biggest holders, Strategy and Metaplanet, are betting on math, not price");
 if(!r.extracted||!r.headline.includes("Strategy·Metaplanet"))throw new Error(r.headline);
});
test("Binance 이용자 정보 제공 이슈를 규제 속보로 추출",()=>{
 const r=createBitcoinFlash("Binance handed user data to Russia that led to a Ukrainian donor's arrest");
 if(!r.extracted||r.category!=="regulation"||!r.headline.includes("이용자 정보"))throw new Error(r.headline);
});
