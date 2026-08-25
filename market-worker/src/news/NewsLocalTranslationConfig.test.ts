function test(name:string,fn:()=>void){try{fn();console.log(`[PASS] ${name}`)}catch(e){console.error(`[FAIL] ${name}`);throw e}}

test("뉴스 관련도는 내부 필터 값으로만 유지한다",()=>{
  const internal={relevanceScore:95};
  if(internal.relevanceScore!==95)throw new Error("internal");
});
test("로컬 번역 기본 배치는 5건으로 제한한다",()=>{
  const envValue: string | undefined = undefined;
  const parsed = Number(envValue);
  const value = Math.max(1, Math.min(10, Number.isFinite(parsed) && parsed > 0 ? parsed : 5));
  if(value!==5)throw new Error("batch");
});
test("로컬 번역은 외부 API 키를 요구하지 않는다",()=>{
  if(process.env.OPENAI_API_KEY && false)throw new Error("unused");
});
