import assert from "node:assert/strict";
import { analyzeEtfFlowPriceResponse, buildReaction } from "./EtfFlowPriceResponseAnalyzer";

function make(flowUsd:number,prices:Array<number|null>){
  const anchor=80_000;
  const horizons=[6,12,24,48] as const;
  return analyzeEtfFlowPriceResponse({
    asset:"BTC",
    flowDate:"2026-08-25",
    observedAt:"2026-08-25T20:00:00.000Z",
    flowUsd,
    anchorPriceUsd:anchor,
    reactions:horizons.map((h,i)=>buildReaction(h,anchor,prices[i])),
  });
}

function test(name:string,fn:()=>void){
  try{fn();console.log(`[PASS] ${name}`)}
  catch(error){console.error(`[FAIL] ${name}`);throw error}
}

test("ETF 순유입 + BTC 상승은 confirmed_inflow",()=>{
  const r=make(500_000_000,[80_400,80_800,81_600,82_000]);
  assert.equal(r.state,"confirmed_inflow");
  assert.ok(r.score>50);
});

test("ETF 순유입인데 BTC 하락하면 매도 압력 우세로 판정",()=>{
  const r=make(600_000_000,[79_600,79_200,78_400,77_800]);
  assert.equal(r.state,"inflow_selling_pressure");
  assert.ok(r.score<50);
  assert.match(r.summary,/더 강한 매도 압력/);
});

test("ETF 순유출인데 BTC 상승하면 흡수 강세로 판정",()=>{
  const r=make(-450_000_000,[80_500,80_900,81_500,82_200]);
  assert.equal(r.state,"outflow_absorbed");
  assert.ok(r.score>50);
});

test("ETF 순유출 + BTC 하락은 confirmed_outflow",()=>{
  const r=make(-400_000_000,[79_700,79_100,78_600,77_900]);
  assert.equal(r.state,"confirmed_outflow");
  assert.ok(r.score<50);
});

test("가격 반응이 아직 없으면 collecting",()=>{
  const r=make(500_000_000,[null,null,null,null]);
  assert.equal(r.state,"collecting");
});

test("6h/12h/24h/48h 중 24h와 48h 반응을 더 크게 반영",()=>{
  const r=make(500_000_000,[81_000,81_000,78_000,77_000]);
  assert.equal(r.state,"inflow_selling_pressure");
});
