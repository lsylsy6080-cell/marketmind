import type { Phase81Result, SRLevel, SwingLevel, VolumeProfile } from "./types";
const TF_WEIGHT:Record<string,number>={"15m":8,"1h":12,"4h":18,"1d":24};
const WINDOW_WEIGHT:Record<string,number>={"24h":10,"7d":15,"30d":20};
const round=(n:number,d=4)=>Number(n.toFixed(d));
interface Candidate{price:number;kind:"support"|"resistance";weight:number;source:string}
export function detectSwings(candles:{high:number;low:number;openTime:string}[],timeframe:SwingLevel["timeframe"],marketType:SwingLevel["marketType"]="spot",radius=2):SwingLevel[]{
  const out:SwingLevel[]=[];
  for(let i=radius;i<candles.length-radius;i++){
    const c=candles[i], around=candles.slice(i-radius,i+radius+1);
    if(around.every(x=>c.low<=x.low)) out.push({price:c.low,kind:"support",timeframe,marketType,observedAt:c.openTime});
    if(around.every(x=>c.high>=x.high)) out.push({price:c.high,kind:"resistance",timeframe,marketType,observedAt:c.openTime});
  }
  return out.slice(-20);
}
function cluster(candidates:Candidate[],currentPrice:number):SRLevel[]{
  const tolerance=currentPrice*0.0025;
  const sorted=[...candidates].sort((a,b)=>a.price-b.price), groups:Candidate[][]=[];
  for(const c of sorted){const g=groups.at(-1); if(g&&Math.abs(c.price-g.reduce((s,x)=>s+x.price,0)/g.length)<=tolerance)g.push(c);else groups.push([c]);}
  return groups.map(g=>{
    const w=g.reduce((s,x)=>s+x.weight,0), price=g.reduce((s,x)=>s+x.price*x.weight,0)/w;
    const unique=new Set(g.map(x=>x.source));
    const confluence=Math.min(25,Math.max(0,(unique.size-1)*5));
    return {price:round(price,2),strength:Math.min(100,Math.round(w+confluence)),distancePercent:round((price-currentPrice)/currentPrice*100),kind:g[0].kind,sources:[...unique]};
  }).sort((a,b)=>b.strength-a.strength);
}
export function buildSupportResistance(currentPrice:number,profiles:VolumeProfile[],swings:SwingLevel[]):Pick<Phase81Result,"nearestSupport"|"nextSupport"|"nearestResistance"|"nextResistance"|"supportLevels"|"resistanceLevels">{
  const candidates:Candidate[]=[];
  for(const p of profiles){
    const base=WINDOW_WEIGHT[p.window]+(p.marketType==="spot"?4:3);
    const add=(price:number,kind:Candidate["kind"],weight:number,label:string)=>candidates.push({price,kind,weight,source:`${p.marketType}_${p.window}_${label}`});
    add(p.poc,p.poc<=currentPrice?"support":"resistance",base+8,"poc");
    p.hvn.slice(0,3).forEach((n,i)=>add(n.price,n.price<=currentPrice?"support":"resistance",base-i*2,"hvn"));
  }
  for(const s of swings)candidates.push({price:s.price,kind:s.kind,weight:TF_WEIGHT[s.timeframe],source:`${s.marketType}_${s.timeframe}_swing_${s.kind}`});
  const supports=cluster(candidates.filter(c=>c.kind==="support"&&c.price<currentPrice),currentPrice).sort((a,b)=>b.price-a.price);
  const resistances=cluster(candidates.filter(c=>c.kind==="resistance"&&c.price>currentPrice),currentPrice).sort((a,b)=>a.price-b.price);
  return {nearestSupport:supports[0]??null,nextSupport:supports[1]??null,nearestResistance:resistances[0]??null,nextResistance:resistances[1]??null,supportLevels:supports.slice(0,8),resistanceLevels:resistances.slice(0,8)};
}
