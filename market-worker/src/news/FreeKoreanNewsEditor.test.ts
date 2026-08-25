import { buildFreeKoreanNewsEdit } from "./free-korean-news-editor";

function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("비트코인 가격 상승 헤드라인을 한국어 속보형으로 변환",()=>{
  const r=buildFreeKoreanNewsEdit({source:"CoinDesk",title:"Bitcoin rises above $120,000 as ETF inflows grow",sentiment:"bullish",relevanceScore:95});
  if(!r.title.includes("비트코인")||!r.title.includes("상승")||!r.title.includes("상회"))throw new Error(r.title);
});

test("SEC 헤드라인을 한국어형으로 변환",()=>{
  const r=buildFreeKoreanNewsEdit({source:"Decrypt",title:"SEC approves new Bitcoin ETF rules",sentiment:"bullish",relevanceScore:90});
  if(!r.title.includes("미 SEC")||!r.title.includes("승인"))throw new Error(r.title);
});

test("ETF inflow 용어를 한국어로 치환",()=>{
  const r=buildFreeKoreanNewsEdit({source:"Blockworks",title:"Spot Bitcoin ETFs record $500 million inflows",sentiment:"bullish",relevanceScore:90});
  if(!r.title.includes("비트코인 현물 ETF")||!r.title.includes("순유입"))throw new Error(r.title);
});

test("요약에는 시장 영향과 BTC 관련도를 포함",()=>{
  const r=buildFreeKoreanNewsEdit({source:"Cointelegraph",title:"Bitcoin market update",summary:"Bitcoin investors watch funding rates.",sentiment:"neutral",relevanceScore:82});
  if(!r.summary.includes("시장 영향 평가")||!r.summary.includes("82%"))throw new Error(r.summary);
});

test("무료 편집기는 외부 API 키를 요구하지 않는다",()=>{
  const r=buildFreeKoreanNewsEdit({source:"Test",title:"Bitcoin rises",relevanceScore:80});
  if(r.editor!=="marketmind-free-korean-editor-v1")throw new Error("editor");
});
