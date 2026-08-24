import type { LiquidationMinuteSnapshot,LiquidationState } from "./types";

const clamp=(v:number,min=0,max=100)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=4)=>{const m=10**d;return Math.round(v*m)/m};

export function classifyLiquidationWindow(input:{
  longLiquidationUsd:number;
  shortLiquidationUsd:number;
  firstPrice:number|null;
  lastPrice:number|null;
  recentMedianTotalUsd:number|null;
  streamHealthy:boolean;
}):Pick<LiquidationMinuteSnapshot,
  "dominanceRatio"|"dominantSide"|"priceChangePercent"|"burstMultiple"|"state"|
  "directionalBias"|"confidence"|"entryAdjustment"|"overheatAdjustment"|
  "reversalAdjustment"|"reasons"
>{
  const longUsd=Math.max(0,input.longLiquidationUsd);
  const shortUsd=Math.max(0,input.shortLiquidationUsd);
  const total=longUsd+shortUsd;
  const maxSide=Math.max(longUsd,shortUsd);
  const dominanceRatio=total>0?round(maxSide/total,4):0;
  const dominantSide=total<=0?"none":dominanceRatio<0.62?"balanced":longUsd>shortUsd?"longs":"shorts";

  const priceChangePercent=
    input.firstPrice!=null&&input.lastPrice!=null&&input.firstPrice>0
      ?round((input.lastPrice-input.firstPrice)/input.firstPrice*100,5)
      :null;

  const burstMultiple=
    input.recentMedianTotalUsd!=null&&input.recentMedianTotalUsd>0
      ?round(total/input.recentMedianTotalUsd,3)
      :null;

  if(!input.streamHealthy){
    return {
      dominanceRatio,dominantSide,priceChangePercent,burstMultiple,
      state:"insufficient_data",directionalBias:"neutral",confidence:0,
      entryAdjustment:0,overheatAdjustment:0,reversalAdjustment:0,
      reasons:["Liquidation WebSocket 연결 상태가 불안정해 Decision 보정을 적용하지 않습니다."],
    };
  }

  if(total<=0){
    return {
      dominanceRatio,dominantSide,priceChangePercent,burstMultiple,
      state:"quiet",directionalBias:"neutral",confidence:30,
      entryAdjustment:0,overheatAdjustment:0,reversalAdjustment:0,
      reasons:["해당 1분 구간에 BTC 강제청산 이벤트가 관측되지 않았습니다."],
    };
  }

  const burst=burstMultiple??1;
  const isBurst=burst>=2;
  let state:LiquidationState="quiet";
  let directionalBias:"bullish"|"bearish"|"neutral"="neutral";
  let entryAdjustment=0,overheatAdjustment=0,reversalAdjustment=0;
  const reasons:string[]=[];

  // BUY force-order = SHORT position forced buy = short liquidation
  // SELL force-order = LONG position forced sell = long liquidation
  if(shortUsd>longUsd && dominanceRatio>=0.62 && (priceChangePercent??0)>=0){
    state="short_squeeze";
    directionalBias="bullish";
    entryAdjustment=-3;
    overheatAdjustment=isBurst?10:6;
    reversalAdjustment=isBurst?6:3;
    reasons.push("SHORT 강제청산이 우세하고 가격도 상승해 숏스퀴즈 성격으로 분류했습니다.");
    reasons.push("신규 현물/선물 매수보다 강제 BUY가 상승을 증폭했을 수 있어 추격 LONG을 억제합니다.");
  }else if(longUsd>shortUsd && dominanceRatio>=0.62 && (priceChangePercent??0)<=0){
    state="long_flush";
    directionalBias="bearish";
    entryAdjustment=-3;
    overheatAdjustment=isBurst?7:4;
    reversalAdjustment=isBurst?7:4;
    reasons.push("LONG 강제청산이 우세하고 가격도 하락해 롱 플러시 성격으로 분류했습니다.");
    reasons.push("신규 SHORT 구축과 강제 SELL을 구분하기 위해 추격 SHORT 진입품질을 보수적으로 조정합니다.");
  }else if(isBurst && dominanceRatio<0.70){
    state="mixed_cascade";
    directionalBias="neutral";
    entryAdjustment=-5;
    overheatAdjustment=8;
    reversalAdjustment=8;
    reasons.push("LONG/SHORT 청산이 동시에 크게 증가한 혼합 청산 캐스케이드입니다.");
    reasons.push("방향성보다 변동성 위험을 우선해 신규 진입품질을 낮춥니다.");
  }else{
    state="quiet";
    reasons.push("청산 이벤트는 있었지만 방향 우위나 burst 조건이 충분하지 않아 중립 처리했습니다.");
  }

  const volumeConfidence=clamp(25+Math.log10(Math.max(1,total))*8,25,70);
  const dominanceConfidence=clamp((dominanceRatio-.5)*120,0,30);
  const burstConfidence=burstMultiple==null?0:clamp((burstMultiple-1)*12,0,25);
  const confidence=round(clamp(volumeConfidence+dominanceConfidence+burstConfidence));

  return {
    dominanceRatio,dominantSide,priceChangePercent,burstMultiple,
    state,directionalBias,confidence,
    entryAdjustment:round(entryAdjustment,2),
    overheatAdjustment:round(overheatAdjustment,2),
    reversalAdjustment:round(reversalAdjustment,2),
    reasons,
  };
}
