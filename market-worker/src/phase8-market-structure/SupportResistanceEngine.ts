import type { Phase81Result, SRLevel, StructureSeries, SwingLevel, VolumeProfile, ZoneGrade, ZoneScoreBreakdown } from "./types";
const TF_WEIGHT:Record<string,number>={"15m":8,"1h":12,"4h":18,"1d":24};
const WINDOW_WEIGHT:Record<string,number>={"24h":10,"7d":15,"30d":20};
const round=(n:number,d=4)=>Number(n.toFixed(d));
const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
interface Candidate{price:number;originKind:"support"|"resistance";weight:number;source:string;timeframe:string;volumeSignal:boolean}
export function detectSwings(candles:{high:number;low:number;openTime:string}[],timeframe:SwingLevel["timeframe"],marketType:SwingLevel["marketType"]="spot",radius=2):SwingLevel[]{
  const out:SwingLevel[]=[];
  for(let i=radius;i<candles.length-radius;i++){
    const c=candles[i], around=candles.slice(i-radius,i+radius+1);
    if(around.every(x=>c.low<=x.low)) out.push({price:c.low,kind:"support",timeframe,marketType,observedAt:c.openTime});
    if(around.every(x=>c.high>=x.high)) out.push({price:c.high,kind:"resistance",timeframe,marketType,observedAt:c.openTime});
  }
  return out.slice(-20);
}
function grade(score:number):ZoneGrade{return score>=85?"S":score>=70?"A":score>=50?"B":"C"}
function reactionMetrics(price:number,zoneLow:number,zoneHigh:number,kind:SRLevel["kind"],series:StructureSeries[]){
  let touchCount=0,rejectionTotal=0,lastTouchedAt:string|null=null,roleFlipCount=0,invalidated=false;
  for(const input of series){
    let touching=false,previousSide:1|-1|0=0;
    for(const candle of input.candles){
      const hit=candle.low<=zoneHigh&&candle.high>=zoneLow;
      if(hit&&!touching){
        touchCount++;
        lastTouchedAt=!lastTouchedAt||Date.parse(candle.openTime)>Date.parse(lastTouchedAt)?candle.openTime:lastTouchedAt;
        const rejection=kind==="support"?(candle.close-candle.low)/price*100:(candle.high-candle.close)/price*100;
        rejectionTotal+=clamp(rejection,0,3);
      }
      touching=hit;
      const side:candleSide = candle.close>zoneHigh?1:candle.close<zoneLow?-1:0;
      if(side!==0&&previousSide!==0&&side!==previousSide)roleFlipCount++;
      if(side!==0)previousSide=side;
    }
    const latest=input.candles.slice(-2);
    if(latest.length===2&&latest.every(candle=>kind==="support"?candle.close<zoneLow-price*.001:candle.close>zoneHigh+price*.001))invalidated=true;
  }
  return {touchCount,rejectionPercent:touchCount?rejectionTotal/touchCount:0,lastTouchedAt,roleFlipCount,invalidated};
}
type candleSide=1|-1|0;

function cluster(candidates:Candidate[],currentPrice:number,series:StructureSeries[]):SRLevel[]{
  const tolerance=currentPrice*0.0025;
  const referenceMs=Math.max(0,...series.flatMap(x=>x.candles.map(c=>Date.parse(c.openTime)).filter(Number.isFinite)))||Date.now();
  const sorted=[...candidates].sort((a,b)=>a.price-b.price), groups:Candidate[][]=[];
  for(const c of sorted){const g=groups.at(-1); if(g&&Math.abs(c.price-g.reduce((s,x)=>s+x.price,0)/g.length)<=tolerance)g.push(c);else groups.push([c]);}
  return groups.map(g=>{
    const w=g.reduce((s,x)=>s+x.weight,0), price=g.reduce((s,x)=>s+x.price*x.weight,0)/w;
    const sources=[...new Set(g.map(x=>x.source))];
    const timeframes=[...new Set(g.map(x=>x.timeframe).filter(Boolean))];
    const kind:SRLevel["kind"]=price<=currentPrice?"support":"resistance";
    const halfWidth=Math.max(currentPrice*.00125,(Math.max(...g.map(x=>x.price))-Math.min(...g.map(x=>x.price)))/2);
    const zoneLow=price-halfWidth,zoneHigh=price+halfWidth;
    const reaction=reactionMetrics(price,zoneLow,zoneHigh,kind,series);
    const parsedTouch=reaction.lastTouchedAt?Date.parse(reaction.lastTouchedAt):NaN;
    const ageDays=Number.isFinite(parsedTouch)?Math.max(0,(referenceMs-parsedTouch)/86400000):999;
    const mixedOrigins=new Set(g.map(x=>x.originKind)).size>1;
    const roleFlipCount=reaction.roleFlipCount+(mixedOrigins?1:0);
    const scoreBreakdown:ZoneScoreBreakdown={
      volume:round(clamp(g.filter(x=>x.volumeSignal).reduce((sum,x)=>sum+x.weight,0)*.65,0,25),1),
      touches:round(clamp(reaction.touchCount*3,0,20),1),
      rejection:round(clamp(reaction.rejectionPercent/1.2*15,0,15),1),
      recency:round(clamp(10-ageDays/3,0,10),1),
      confluence:round(clamp((sources.length-1)*2.5+(timeframes.length-1)*4,0,20),1),
      roleFlip:round(clamp(reaction.roleFlipCount*2+(mixedOrigins?4:0),0,10),1),
      invalidationPenalty:reaction.invalidated?-15:0
    };
    const strength=Math.round(clamp(Object.values(scoreBreakdown).reduce((sum,x)=>sum+x,0)));
    const reasons:string[]=[];
    if(scoreBreakdown.volume>=15)reasons.push("거래량 집중 구간");
    if(timeframes.length>=2)reasons.push(`${timeframes.join("·")} 중첩`);
    if(reaction.touchCount>=2)reasons.push(`${reaction.touchCount}회 가격 반응`);
    if(reaction.rejectionPercent>=.35)reasons.push(`평균 ${round(reaction.rejectionPercent,2)}% 거절`);
    if(scoreBreakdown.roleFlip>0)reasons.push("지지·저항 역할 전환 이력");
    if(reaction.invalidated)reasons.push("최근 종가 이탈로 신뢰도 감점");
    if(!reasons.length)reasons.push("단일 구조 근거");
    const status:SRLevel["status"]=reaction.invalidated?"weakened":"active";
    return {price:round(price,2),zoneLow:round(zoneLow,2),zoneHigh:round(zoneHigh,2),strength,grade:grade(strength),status,distancePercent:round((price-currentPrice)/currentPrice*100),kind,sources,timeframes,touchCount:reaction.touchCount,rejectionPercent:round(reaction.rejectionPercent,3),lastTouchedAt:reaction.lastTouchedAt,roleFlipCount,scoreBreakdown,reasons};
  }).filter(level=>level.status==="active"||level.strength>=50).sort((a,b)=>b.strength-a.strength);
}
export function buildSupportResistance(currentPrice:number,profiles:VolumeProfile[],swings:SwingLevel[],series:StructureSeries[]=[]):Pick<Phase81Result,"nearestSupport"|"nextSupport"|"nearestResistance"|"nextResistance"|"supportLevels"|"resistanceLevels">{
  const candidates:Candidate[]=[];
  for(const p of profiles){
    const base=WINDOW_WEIGHT[p.window]+(p.marketType==="spot"?4:3);
    const add=(price:number,originKind:Candidate["originKind"],weight:number,label:string)=>candidates.push({price,originKind,weight,source:`${p.marketType}_${p.window}_${p.sourceTimeframe}_${label}`,timeframe:p.sourceTimeframe,volumeSignal:true});
    add(p.poc,p.poc<=currentPrice?"support":"resistance",base+8,"poc");
    p.hvn.slice(0,3).forEach((n,i)=>add(n.price,n.price<=currentPrice?"support":"resistance",base-i*2,"hvn"));
  }
  for(const s of swings)candidates.push({price:s.price,originKind:s.kind,weight:TF_WEIGHT[s.timeframe],source:`${s.marketType}_${s.timeframe}_swing_${s.kind}`,timeframe:s.timeframe,volumeSignal:false});
  const levels=cluster(candidates,currentPrice,series);
  const supports=levels.filter(x=>x.kind==="support"&&(x.zoneHigh??x.price)<currentPrice).sort((a,b)=>b.price-a.price);
  const resistances=levels.filter(x=>x.kind==="resistance"&&(x.zoneLow??x.price)>currentPrice).sort((a,b)=>a.price-b.price);
  const important=(rows:SRLevel[])=>rows.filter(x=>x.grade!=="C"||rows.filter(y=>y.grade!=="C").length===0).slice(0,8);
  const supportLevels=important(supports),resistanceLevels=important(resistances);
  return {nearestSupport:supportLevels[0]??null,nextSupport:supportLevels[1]??null,nearestResistance:resistanceLevels[0]??null,nextResistance:resistanceLevels[1]??null,supportLevels,resistanceLevels};
}
