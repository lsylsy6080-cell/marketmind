import type { CandleRow, MarketType, ProfileWindow, VolumeNode, VolumeProfile } from "./types";
const round=(n:number,d=2)=>Number(n.toFixed(d));
export function buildVolumeProfile(marketType:MarketType,window:ProfileWindow,sourceTimeframe:string,candles:CandleRow[],binCount=80):VolumeProfile{
  if(candles.length<10) throw new Error(`${marketType}/${window} profile 캔들 부족: ${candles.length}`);
  const low=Math.min(...candles.map(c=>c.low)), high=Math.max(...candles.map(c=>c.high));
  const step=Math.max((high-low)/binCount,0.01), bins=Array.from({length:binCount},()=>0);
  for(const c of candles){
    const typical=(c.high+c.low+c.close)/3;
    const idx=Math.min(binCount-1,Math.max(0,Math.floor((typical-low)/step)));
    bins[idx]+=c.quoteVolume>0?c.quoteVolume:c.volume*typical;
  }
  const total=bins.reduce((a,b)=>a+b,0)||1;
  const nodes=bins.map((volume,i):VolumeNode=>({price:round(low+(i+0.5)*step),volume:round(volume),sharePercent:round(volume/total*100,4)}));
  const sorted=[...nodes].sort((a,b)=>b.volume-a.volume);
  const poc=sorted[0].price;
  const hvn=sorted.slice(0,Math.min(5,sorted.length));
  const eligible=nodes.filter(n=>n.volume>0).sort((a,b)=>a.volume-b.volume);
  const lvn=eligible.slice(0,Math.min(5,eligible.length));
  return {marketType,window,sourceTimeframe,candleCount:candles.length,low:round(low),high:round(high),poc,hvn,lvn};
}
