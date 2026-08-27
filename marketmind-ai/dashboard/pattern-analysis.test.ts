import { analyzeChartPatterns, type PatternCandle } from "./pattern-analysis";

function candlesFrom(values:number[]):PatternCandle[]{
  const start=1_700_000_000;
  return values.map((close,i)=>({
    time:start+i*3600,
    open:close*(1+(i%2?-.001:.001)),
    high:close*1.004,
    low:close*.996,
    close,
    volume:100+i,
  }));
}

const base=Array.from({length:140},(_,i)=>60000+i*15+Math.sin(i/5)*350);
const result=analyzeChartPatterns(candlesFrom(base));
if(result.bullishProbability+result.neutralProbability+result.bearishProbability!==100){
  throw new Error("확률 합계가 100이 아닙니다.");
}
if(result.currentPrice==null)throw new Error("현재가가 없습니다.");
console.log("[PASS] 패턴 확률 합계 100");
console.log("[PASS] 1시간봉 패턴 분석 기본 결과 생성");
