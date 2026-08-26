import { createBitcoinFlash } from "./news-flash-editor";
function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}
test("트레이더 베팅 뉴스에서 가격과 금액을 추출한다",()=>{
 const r=createBitcoinFlash("Bitcoin traders place $2.9 million bet on a rapid price surge above $82,000");
 if(!r.extracted||!r.headline.includes("$82,000")||!r.headline.includes("$2.9 million"))throw new Error(r.headline);
});
test("ETF 유입 뉴스는 속보형으로 재구성한다",()=>{
 const r=createBitcoinFlash("Spot Bitcoin ETFs record $500 million inflows");
 if(!r.headline.includes("현물 ETF")||!r.headline.includes("순유입"))throw new Error(r.headline);
});
test("SEC 뉴스는 규제 속보로 재구성한다",()=>{
 const r=createBitcoinFlash("SEC approves new Bitcoin ETF rules");
 if(!r.headline.includes("미 SEC")||!r.headline.includes("승인"))throw new Error(r.headline);
});
test("패턴 미일치 뉴스는 억지 번역하지 않고 원문을 유지한다",()=>{
 const r=createBitcoinFlash("A curious development nobody expected");
 if(r.extracted||!r.headline.startsWith("[원문]"))throw new Error(r.headline);
});
test("속보 편집기는 외부 API 비용이 없다",()=>{
 const r=createBitcoinFlash("Bitcoin rises above $82,000");
 if(!r.extracted)throw new Error("expected extraction");
});
