import {
  analyzeEtfFlowPriceResponse,
  buildReaction,
} from "../src/etf-price-response/EtfFlowPriceResponseAnalyzer";
import {
  loadBtcPrices,
  loadRecentBtcEtfFlows,
  saveEtfPriceResponse,
  type PricePoint,
} from "../src/etf-price-response/repository";
import { usEtMarketCloseUtc } from "../src/etf-price-response/time";

const HORIZONS=[6,12,24,48] as const;

function nearestPrice(
  prices:PricePoint[],
  targetMs:number,
  toleranceMinutes=20,
):number|null{
  let best:PricePoint|null=null;
  let bestDistance=Infinity;

  for(const point of prices){
    const distance=Math.abs(new Date(point.at).getTime()-targetMs);
    if(distance<bestDistance){
      best=point;
      bestDistance=distance;
    }
  }

  return best&&bestDistance<=toleranceMinutes*60_000?best.close:null;
}

async function main(){
  console.log("[ETF 가격반응 V1] 시작");

  const flows=(await loadRecentBtcEtfFlows(20)).reverse();
  if(flows.length===0){
    console.log("[ETF 가격반응 V1] 분석할 ETF 흐름 데이터가 없습니다.");
    return;
  }

  let completed=0,collecting=0,failed=0;

  for(const flow of flows){
    try{
      const observedAt=usEtMarketCloseUtc(flow.flow_date);
      const anchorMs=new Date(observedAt).getTime();

      const prices=await loadBtcPrices(
        new Date(anchorMs-30*60_000).toISOString(),
        new Date(anchorMs+48*60*60_000+30*60_000).toISOString(),
      );

      const anchorPrice=nearestPrice(prices,anchorMs);
      if(anchorPrice===null){
        console.log(`[ETF 가격반응 V1] ${flow.flow_date} 기준 가격 없음 · 건너뜀`);
        collecting++;
        continue;
      }

      const reactions=HORIZONS.map((hours)=>buildReaction(
        hours,
        anchorPrice,
        nearestPrice(prices,anchorMs+hours*60*60_000),
      ));

      const result=analyzeEtfFlowPriceResponse({
        asset:"BTC",
        flowDate:flow.flow_date,
        observedAt,
        flowUsd:flow.total_flow_usd,
        anchorPriceUsd:anchorPrice,
        reactions,
      });

      await saveEtfPriceResponse(result,flow.source);

      const r24=result.reactions.find((r)=>r.horizonHours===24)?.returnPercent;
      console.log(
        `[ETF 가격반응 V1] ${flow.flow_date} · flow=${(flow.total_flow_usd/1_000_000).toFixed(1)}M · 24h=${r24===null||r24===undefined?"수집중":`${r24>=0?"+":""}${r24.toFixed(2)}%`} · ${result.state} · score=${result.score}`,
      );

      completed++;
      if(result.state==="collecting")collecting++;
    }catch(error:unknown){
      failed++;
      console.error(
        `[ETF 가격반응 V1] ${flow.flow_date} 실패: ${error instanceof Error?error.message:String(error)}`,
      );
    }
  }

  console.log("[ETF 가격반응 V1] 완료",{
    requested:flows.length,
    completed,
    collecting,
    failed,
  });
}

main()
  .then(()=>process.exit(0))
  .catch((error)=>{
    console.error(error);
    process.exit(1);
  });
