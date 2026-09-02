import { buildVolumeProfile } from "./VolumeProfileEngine";
import { buildSupportResistance, detectSwings } from "./SupportResistanceEngine";
import type { CandleRow } from "./types";
const candles=Array.from({length:100},(_,i)=>({openTime:new Date(1700000000000+i*60000).toISOString(),open:100+i*.1,high:101+i*.1,low:99+i*.1,close:100.5+i*.1,volume:10+i%7,quoteVolume:(10+i%7)*(100.5+i*.1)}));
const profile=buildVolumeProfile("spot","24h","5m",candles);
if(!profile.poc||profile.hvn.length===0)throw new Error("profile 실패");
console.log("[PASS] Volume Profile POC/HVN/LVN 계산");
const swings=detectSwings([{openTime:"1",high:10,low:8},{openTime:"2",high:12,low:7},{openTime:"3",high:11,low:8},{openTime:"4",high:13,low:9},{openTime:"5",high:12,low:8}],"1h","spot",1);
if(!swings.length)throw new Error("swing 실패");
console.log("[PASS] Swing High/Low 탐지");
const sr=buildSupportResistance(110,[profile],swings,[{timeframe:"1h",marketType:"spot",candles}]);
if(!sr.supportLevels.length)throw new Error("S/R 실패");
console.log("[PASS] Support/Resistance 강도 및 거리 계산");
if(!sr.nearestSupport?.grade||!sr.nearestSupport.scoreBreakdown||sr.nearestSupport.zoneLow==null||sr.nearestSupport.zoneHigh==null||sr.nearestSupport.zoneLow>=sr.nearestSupport.zoneHigh)throw new Error("등급화 실패");
console.log("[PASS] 매물대 S/A/B/C 등급 및 점수 근거 계산");

const now=Date.now();
const reactionCandles:CandleRow[]=Array.from({length:40},(_,i)=>{
 const base=i%6===0?100:103+i*.03;
 return {openTime:new Date(now-(40-i)*3600000).toISOString(),open:base+1,high:base+2,low:base-.15,close:base+1.5,volume:100,quoteVolume:100*(base+1)};
});
const reactionProfile=buildVolumeProfile("spot","7d","1h",reactionCandles,20);
const enriched=buildSupportResistance(108,[reactionProfile],[
 {price:100,kind:"support",timeframe:"1h",marketType:"spot",observedAt:reactionCandles[6].openTime},
 {price:100.1,kind:"resistance",timeframe:"4h",marketType:"futures",observedAt:reactionCandles[12].openTime},
 {price:100.05,kind:"support",timeframe:"1d",marketType:"spot",observedAt:reactionCandles[18].openTime}
],[{timeframe:"1h",marketType:"spot",candles:reactionCandles}]);
const important=enriched.supportLevels.find(x=>Math.abs(x.price-100)<1);
if(!important||(important.touchCount??0)<2||(important.timeframes?.length??0)<2||(important.roleFlipCount??0)<1)throw new Error("중요 매물대 근거 집계 실패");
if(!important.grade||!["S","A","B"].includes(important.grade))throw new Error(`중요 매물대 등급이 너무 낮음: ${important.grade}`);
console.log("[PASS] 반복 반응·멀티 타임프레임·역할 전환 중요도 반영");
