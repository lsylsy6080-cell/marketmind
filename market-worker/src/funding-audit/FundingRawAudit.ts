import { supabase } from "../lib/supabase";

type PremiumIndex = { symbol:string; lastFundingRate:string; interestRate?:string; markPrice:string; indexPrice:string; nextFundingTime:number; time:number };
const round=(v:number,d=8)=>{const m=10**d;return Math.round(v*m)/m};

export async function runFundingRawAudit(){
  const response=await fetch("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT",{headers:{Accept:"application/json"}});
  if(!response.ok) throw new Error(`[Funding Raw Audit] Binance HTTP ${response.status}`);
  const raw=await response.json() as PremiumIndex;
  const rawRate=Number(raw.lastFundingRate);
  if(!Number.isFinite(rawRate)) throw new Error(`[Funding Raw Audit] lastFundingRate invalid: ${raw.lastFundingRate}`);
  const {data,error}=await supabase.from("funding_snapshots")
    .select("id,fetched_at,funding_rate,funding_rate_percent,score,score_details,strategy_version")
    .eq("symbol","BTCUSDT").order("fetched_at",{ascending:false}).limit(20);
  if(error) throw new Error(`[Funding Raw Audit] DB 조회 실패: ${error.message}`);
  const rows=(data??[]) as any[];
  const latest=rows[0]??null;
  const dbRate=latest?Number(latest.funding_rate):null;
  const rawBp=rawRate*10000;
  const dbBp=dbRate==null?null:dbRate*10000;
  const exactOneBpCount=rows.filter(r=>Math.abs(Number(r.funding_rate)*10000-1)<1e-9).length;
  const comparison= dbRate==null ? null : {
    absoluteRateDifference: round(Math.abs(rawRate-dbRate),12),
    basisPointDifference: round(Math.abs(rawBp-dbBp!),8),
    note: "API 현재값과 DB 최신값은 수집 시점이 달라 소폭 차이날 수 있습니다.",
  };
  let diagnosis="no_local_clipping_detected";
  const reasons:string[]=[];
  if(latest){
    const detailBp=Number(latest.score_details?.funding_basis_points);
    if(Number.isFinite(detailBp) && Math.abs(detailBp-dbBp!)>0.0002){ diagnosis="db_transform_mismatch"; reasons.push("DB funding_rate와 score_details funding_basis_points 변환값이 일치하지 않습니다."); }
    else reasons.push("DB funding_rate × 10,000과 score_details basis points가 일치해 저장 단계 clipping 징후가 없습니다.");
  }
  if(Math.abs(rawBp-1)<1e-9) reasons.push("Binance API 현재 lastFundingRate 자체가 정확히 1bp입니다. 1bp 집중은 원본 값 특성일 가능성이 있습니다.");
  else reasons.push(`Binance API 현재 원본은 ${round(rawBp,6)}bp로 1bp에 고정되어 있지 않습니다.`);
  if(rows.length) reasons.push(`DB 최근 ${rows.length}건 중 정확히 1bp인 값 ${exactOneBpCount}건 (${round(exactOneBpCount/rows.length*100,2)}%).`);
  return {symbol:"BTCUSDT",calculatedAt:new Date().toISOString(),binanceRaw:{lastFundingRate:raw.lastFundingRate,fundingRate:Number(raw.lastFundingRate),fundingBasisPoints:round(rawBp,8),interestRate:raw.interestRate??null,markPrice:raw.markPrice,indexPrice:raw.indexPrice,exchangeTime:new Date(raw.time).toISOString(),nextFundingTime:new Date(raw.nextFundingTime).toISOString()},dbLatest:latest?{id:latest.id,fetchedAt:latest.fetched_at,fundingRate:dbRate,fundingBasisPoints:round(dbBp!,8),fundingRatePercent:latest.funding_rate_percent,score:latest.score,strategyVersion:latest.strategy_version}:null,recentDbSample:{count:rows.length,exactOneBasisPointCount:exactOneBpCount,exactOneBasisPointRatio:rows.length?round(exactOneBpCount/rows.length):0},comparison,diagnosis,reasons,strategyVersion:"funding-raw-audit-v2.3b"};
}
