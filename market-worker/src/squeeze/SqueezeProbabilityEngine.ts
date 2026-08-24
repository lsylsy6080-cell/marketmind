import type {SqueezeAssessment,SqueezeLevel,SqueezeProbabilityResult,SqueezeSide} from "./types";
const clamp=(v:number,min=0,max=100)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=2)=>{const m=10**d;return Math.round(v*m)/m};
const level=(p:number):SqueezeLevel=>p>=80?"critical":p>=65?"high":p>=50?"elevated":p>=35?"watch":"low";
export interface ZoneInput{centerPrice:number;intensity:number;confidence:number}
export interface SqueezeInput{
 currentPrice:number;priceChange5mPercent:number|null;oiChange5mPercent:number|null;
 takerBuyRatio:number|null;liquidationState:string|null;liquidationBias:string|null;
 liquidationConfidence:number|null;longLiquidationUsd:number|null;shortLiquidationUsd:number|null;
 longZones:ZoneInput[];shortZones:ZoneInput[];dataReliability:number;
}
function nearest(side:SqueezeSide,current:number,zones:ZoneInput[]){
 const valid=zones.filter(z=>side==="long_squeeze"?z.centerPrice<current:z.centerPrice>current);
 return valid.sort((a,b)=>Math.abs(a.centerPrice-current)-Math.abs(b.centerPrice-current))[0]??null;
}
function assess(side:SqueezeSide,i:SqueezeInput):SqueezeAssessment{
 const z=nearest(side,i.currentPrice,side==="long_squeeze"?i.longZones:i.shortZones);
 const dist=z?Math.abs(z.centerPrice-i.currentPrice)/i.currentPrice*100:null;
 const proximity=dist==null?0:clamp(100-dist*35);
 const zoneIntensity=z?.intensity??0,zoneConfidence=z?.confidence??0;
 const move=i.priceChange5mPercent??0;
 const directionalMove=side==="long_squeeze"?Math.max(0,-move):Math.max(0,move);
 const pricePressure=clamp(directionalMove*180);
 const taker=i.takerBuyRatio;
 const takerPressure=taker==null?0:side==="long_squeeze"?clamp((.5-taker)*250):clamp((taker-.5)*250);
 const triggerPressure=clamp(pricePressure*.65+takerPressure*.35);
 const oi=i.oiChange5mPercent;
 // Falling OI while price moves adversely is consistent with forced position reduction.
 const oiConfirmation=oi==null?0:(oi<0?clamp(Math.abs(oi)*120):clamp(20-Math.abs(oi)*30,0,20));
 const expectedBias=side==="long_squeeze"?"bearish":"bullish";
 const liqBias=(i.liquidationBias??"").toLowerCase();
 const liqState=(i.liquidationState??"").toLowerCase();
 const liqUsd=side==="long_squeeze"?(i.longLiquidationUsd??0):(i.shortLiquidationUsd??0);
 let liquidationConfirmation=0;
 if(liqBias===expectedBias)liquidationConfirmation+=35;
 if(["long_flush","short_squeeze","mixed_cascade"].includes(liqState))liquidationConfirmation+=25;
 liquidationConfirmation+=clamp((i.liquidationConfidence??0)*.25,0,25);
 if(liqUsd>0)liquidationConfirmation+=clamp(Math.log10(1+liqUsd)*5,0,15);
 liquidationConfirmation=clamp(liquidationConfirmation);
 const zoneScore=clamp(proximity*.45+zoneIntensity*.35+zoneConfidence*.20);
 // Zone risk can raise WATCH, but HIGH/CRITICAL requires market pressure/confirmation.
 let p=zoneScore*.38+triggerPressure*.27+oiConfirmation*.13+liquidationConfirmation*.14+clamp(i.dataReliability)*.08;
 if(triggerPressure<20&&liquidationConfirmation<20)p=Math.min(p,49);
 if(!z)p=Math.min(p,44);
 p=clamp(p);
 const reasons:string[]=[];
 if(z)reasons.push(`가장 가까운 ${side==="long_squeeze"?"LONG":"SHORT"} 청산 추정구간 거리 ${round(dist??0)}% · intensity ${round(zoneIntensity)}`);
 else reasons.push("유효한 예상 청산구간이 아직 없습니다.");
 reasons.push(`5분 가격압력 ${round(pricePressure)} · Taker 압력 ${round(takerPressure)} · 결합 ${round(triggerPressure)}`);
 reasons.push(`OI 확인 ${round(oiConfirmation)} · 실제 청산 확인 ${round(liquidationConfirmation)}`);
 if(i.takerBuyRatio==null)reasons.push("Taker 데이터 미사용/미확보로 해당 보정은 중립 처리했습니다.");
 return{side,probability:round(p),level:level(p),nearestZoneDistancePercent:dist==null?null:round(dist,4),nearestZoneIntensity:round(zoneIntensity),zoneConfidence:round(zoneConfidence),triggerPressure:round(triggerPressure),oiConfirmation:round(oiConfirmation),liquidationConfirmation:round(liquidationConfirmation),dataReliability:round(clamp(i.dataReliability)),reasons};
}
export function calculateSqueezeProbability(i:SqueezeInput):SqueezeProbabilityResult{
 if(!Number.isFinite(i.currentPrice)||i.currentPrice<=0)throw new Error("currentPrice must be > 0");
 const longSqueeze=assess("long_squeeze",i),shortSqueeze=assess("short_squeeze",i);
 const diff=longSqueeze.probability-shortSqueeze.probability;
 return{symbol:"BTCUSDT",calculatedAt:new Date().toISOString(),currentPrice:round(i.currentPrice),longSqueeze,shortSqueeze,dominantRisk:Math.abs(diff)<8?"balanced":diff>0?"long_squeeze":"short_squeeze",strategyVersion:"squeeze-probability-v7.14"};
}
