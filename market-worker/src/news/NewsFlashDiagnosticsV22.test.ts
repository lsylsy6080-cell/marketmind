import { buildFlashMismatchReport, formatFlashMismatchReport } from "./news-flash-diagnostics";

function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

const rows = [
  { id:1, source:"CoinDesk", title:"Title A", category:"market" },
  { id:2, source:"CoinDesk", title:"Title B", category:"market" },
  { id:3, source:"The Block", title:"Title C", category:"other" },
];

test("미일치 전체 건수를 집계한다",()=>{
  const r=buildFlashMismatchReport(rows);
  if(r.total!==3)throw new Error(String(r.total));
});
test("출처별 미일치 건수를 내림차순 집계한다",()=>{
  const r=buildFlashMismatchReport(rows);
  if(r.bySource[0]?.source!=="CoinDesk"||r.bySource[0]?.count!==2)throw new Error(JSON.stringify(r.bySource));
});
test("분류별 미일치 건수를 집계한다",()=>{
  const r=buildFlashMismatchReport(rows);
  if(r.byCategory.find(x=>x.category==="market")?.count!==2)throw new Error(JSON.stringify(r.byCategory));
});
test("진단 로그에 실제 원문 제목을 포함한다",()=>{
  const text=formatFlashMismatchReport(buildFlashMismatchReport(rows)).join("\n");
  if(!text.includes("Title A")||!text.includes("The Block"))throw new Error(text);
});
test("로그 출력 기사 수를 제한할 수 있다",()=>{
  const r=buildFlashMismatchReport(rows,2);
  if(r.items.length!==2)throw new Error(String(r.items.length));
});
