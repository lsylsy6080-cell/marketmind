import { buildShadowValidation, validateFunding, validateNews, type PricePoint } from "./ShadowSignalValidator";
const assert=(c:boolean,m:string)=>{if(!c)throw new Error(m)}; const pass=(m:string)=>console.log(`[PASS] ${m}`);
function prices(start:number,hours=240):PricePoint[]{const out:PricePoint[]=[]; for(let i=0;i<=hours*12;i++){out.push({at:new Date(start+i*300_000).toISOString(),close:100+i*.02});} return out;}
const start=Date.UTC(2026,0,1); const px=prices(start);
{
  const rows=Array.from({length:100},(_,i)=>({calculated_at:new Date(start+i*3600_000).toISOString(),weighted_score:i%10===0?52:i%10===1?48:50}));
  const r=validateNews(rows,px,.7); assert(r.candidateThresholds.bullish<57,"candidate bullish threshold should adapt"); pass("News 후보 threshold를 calibration 구간에서만 계산한다");
}
{
  const rows=Array.from({length:100},(_,i)=>({fetched_at:new Date(start+i*3600_000).toISOString(),funding_rate:0.0001,direction:"neutral"}));
  const r=validateFunding(rows,px,.7); assert(r.candidateStatus==="distribution_saturated","same max funding should be saturated"); pass("Funding 동일 상단값 포화를 감지한다");
}
{
  const news=Array.from({length:100},(_,i)=>({calculated_at:new Date(start+i*3600_000).toISOString(),weighted_score:i%5===0?52:i%5===1?48:50}));
  const funding=Array.from({length:100},(_,i)=>({fetched_at:new Date(start+i*3600_000).toISOString(),funding_rate:0.0001,direction:"neutral"}));
  const r=buildShadowValidation({newsRows:news,fundingRows:funding,prices:px}); assert(r.strategyVersion.includes("2.3a4"),"version"); pass("Shadow Validation 전체 결과를 생성한다");
}
