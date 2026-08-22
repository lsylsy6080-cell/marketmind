import type { OIFlowState,OpenInterestSnapshot } from "./types";

const clamp=(v:number,min=0,max=100)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=4)=>{const m=10**d;return Math.round(v*m)/m};

export function classifyOpenInterestFlow(input:{
  priceChange15mPercent:number|null;
  oiChange15mPercent:number|null;
  priceChange1hPercent:number|null;
  oiChange1hPercent:number|null;
}):Pick<OpenInterestSnapshot,
  "flowState"|"directionalBias"|"confidence"|"entryAdjustment"|"overheatAdjustment"|"reversalAdjustment"|"reasons"
>{
  const p15=input.priceChange15mPercent, o15=input.oiChange15mPercent;
  const p1h=input.priceChange1hPercent, o1h=input.oiChange1hPercent;
  const reasons:string[]=[];

  if(p15==null||o15==null){
    return {
      flowState:"insufficient_data",directionalBias:"neutral",confidence:0,
      entryAdjustment:0,overheatAdjustment:0,reversalAdjustment:0,
      reasons:["15분 OI/가격 변화 표본이 부족해 OI 보정을 적용하지 않습니다."],
    };
  }

  const priceThreshold=.12;
  const oiThreshold=.18;
  const pUp=p15>=priceThreshold, pDown=p15<=-priceThreshold;
  const oiUp=o15>=oiThreshold, oiDown=o15<=-oiThreshold;

  let flowState:OIFlowState="neutral";
  let directionalBias:"bullish"|"bearish"|"neutral"="neutral";
  let entryAdjustment=0,overheatAdjustment=0,reversalAdjustment=0;

  if(pUp&&oiUp){
    flowState="long_building"; directionalBias="bullish";
    entryAdjustment=4; reversalAdjustment=-2;
    reasons.push("가격 상승과 OI 증가가 동반되어 신규 LONG 구축 성격으로 분류했습니다.");
  }else if(pDown&&oiUp){
    flowState="short_building"; directionalBias="bearish";
    entryAdjustment=4; reversalAdjustment=-2;
    reasons.push("가격 하락과 OI 증가가 동반되어 신규 SHORT 구축 성격으로 분류했습니다.");
  }else if(pUp&&oiDown){
    flowState="short_covering"; directionalBias="bullish";
    entryAdjustment=-3; overheatAdjustment=7; reversalAdjustment=4;
    reasons.push("가격은 상승하지만 OI가 감소해 신규 매수보다 SHORT 청산성 상승 가능성을 높게 봅니다.");
  }else if(pDown&&oiDown){
    flowState="long_unwinding"; directionalBias="bearish";
    entryAdjustment=-2; overheatAdjustment=3; reversalAdjustment=3;
    reasons.push("가격 하락과 OI 감소가 동반되어 신규 SHORT보다 LONG 정리 성격을 높게 봅니다.");
  }else{
    reasons.push("가격/OI 변화가 유의 임계값을 넘지 않아 중립으로 유지합니다.");
  }

  // 1h가 15m와 같은 방향을 지지하면 신뢰도 상승. 반대면 entry boost를 줄인다.
  const magnitude=clamp(Math.abs(p15)*22+Math.abs(o15)*18,0,75);
  let confidence=round(clamp(25+magnitude));
  if(p1h!=null&&o1h!=null){
    const sameLong=flowState==="long_building"&&p1h>0&&o1h>0;
    const sameShort=flowState==="short_building"&&p1h<0&&o1h>0;
    const sameCover=flowState==="short_covering"&&p1h>0&&o1h<0;
    const sameUnwind=flowState==="long_unwinding"&&p1h<0&&o1h<0;
    if(sameLong||sameShort||sameCover||sameUnwind){
      confidence=round(clamp(confidence+15));
      reasons.push("1시간 가격/OI 구조가 15분 분류를 같은 방향으로 확인했습니다.");
    }else if(flowState!=="neutral"){
      confidence=round(clamp(confidence-10));
      entryAdjustment=Math.min(entryAdjustment,1);
      reasons.push("1시간 가격/OI 구조가 15분 신호를 확인하지 않아 진입 보정을 축소했습니다.");
    }
  }

  return {
    flowState,directionalBias,confidence,
    entryAdjustment:round(entryAdjustment,2),
    overheatAdjustment:round(overheatAdjustment,2),
    reversalAdjustment:round(reversalAdjustment,2),
    reasons,
  };
}
