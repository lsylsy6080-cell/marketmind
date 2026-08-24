import type {
  EstimatedLiquidationMap,
  EstimatedLiquidationZone,
  LeverageBucket,
  LiquidationZoneSide,
} from "./types";

const clamp=(v:number,min=0,max=100)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=4)=>{const m=10**d;return Math.round(v*m)/m};

export interface ClusterInput {
  centerPrice:number;
  longIntensity:number;
  shortIntensity:number;
  confidence:number;
  estimatedNewLongOiUsd:number;
  estimatedNewShortOiUsd:number;
}

export const DEFAULT_LEVERAGE_DISTRIBUTION:LeverageBucket[]=[
  {leverage:3,weight:.15},
  {leverage:5,weight:.30},
  {leverage:10,weight:.35},
  {leverage:20,weight:.15},
  {leverage:50,weight:.05},
];

export function estimateLiquidationPrice(input:{
  entryPrice:number;
  side:LiquidationZoneSide;
  leverage:number;
  maintenanceMarginRate?:number;
}):number{
  const mmr=input.maintenanceMarginRate??.005;
  if(input.entryPrice<=0||input.leverage<=1)throw new Error("invalid liquidation input");

  // Simplified isolated-position approximation.
  // Real exchange liquidation prices differ by maintenance tiers, fees, margin mode, and added margin.
  const initialMargin=1/input.leverage;
  const adverseMove=Math.max(.001,initialMargin-mmr);

  return input.side==="long"
    ? input.entryPrice*(1-adverseMove)
    : input.entryPrice*(1+adverseMove);
}

export function buildEstimatedLiquidationMap(input:{
  currentPrice:number;
  clusters:ClusterInput[];
  sourceMapId?:number|null;
  maintenanceMarginRate?:number;
  leverageDistribution?:LeverageBucket[];
  zoneBinPercent?:number;
}):EstimatedLiquidationMap{
  if(!Number.isFinite(input.currentPrice)||input.currentPrice<=0)throw new Error("currentPrice must be > 0");

  const mmr=input.maintenanceMarginRate??.005;
  const levs=input.leverageDistribution??DEFAULT_LEVERAGE_DISTRIBUTION;
  const weightSum=levs.reduce((s,x)=>s+x.weight,0);
  if(Math.abs(weightSum-1)>.001)throw new Error("leverage weights must sum to 1");

  const rawBin=input.currentPrice*((input.zoneBinPercent??.35)/100);
  const zoneBin=Math.max(50,Math.round(rawBin/50)*50);

  type Agg={
    side:LiquidationZoneSide;
    low:number;high:number;center:number;
    riskUsd:number;
    weightedConfidence:number;
    confDen:number;
    sourceClusters:Set<number>;
    clusterCenters:Set<number>;
    leverageMix:Record<string,number>;
  };

  const bins=new Map<string,Agg>();

  const add=(side:LiquidationZoneSide,entry:number,intensity:number,confidence:number,estimatedUsd:number,clusterIndex:number)=>{
    if(intensity<=0||confidence<=0||estimatedUsd<=0)return;

    for(const lev of levs){
      const liq=estimateLiquidationPrice({entryPrice:entry,side,leverage:lev.leverage,maintenanceMarginRate:mmr});
      const idx=Math.floor(liq/zoneBin);
      const low=idx*zoneBin,high=low+zoneBin,center=low+zoneBin/2;
      const key=`${side}:${idx}`;
      const weightedRisk=estimatedUsd*lev.weight*(intensity/100)*(confidence/100);

      const agg=bins.get(key)??{
        side,low,high,center,riskUsd:0,weightedConfidence:0,confDen:0,
        sourceClusters:new Set<number>(),clusterCenters:new Set<number>(),leverageMix:{},
      };

      agg.riskUsd+=weightedRisk;
      agg.weightedConfidence+=confidence*weightedRisk;
      agg.confDen+=weightedRisk;
      agg.sourceClusters.add(clusterIndex);
      agg.clusterCenters.add(entry);
      const levKey=`${lev.leverage}x`;
      agg.leverageMix[levKey]=(agg.leverageMix[levKey]??0)+weightedRisk;
      bins.set(key,agg);
    }
  };

  input.clusters.forEach((c,i)=>{
    add("long",c.centerPrice,c.longIntensity,c.confidence,c.estimatedNewLongOiUsd,i);
    add("short",c.centerPrice,c.shortIntensity,c.confidence,c.estimatedNewShortOiUsd,i);
  });

  const values=[...bins.values()];
  const maxLong=Math.max(0,...values.filter(x=>x.side==="long").map(x=>x.riskUsd));
  const maxShort=Math.max(0,...values.filter(x=>x.side==="short").map(x=>x.riskUsd));

  const zones:EstimatedLiquidationZone[]=values.map(x=>{
    const max=x.side==="long"?maxLong:maxShort;
    const intensity=max>0?clamp(x.riskUsd/max*100):0;
    const confidence=x.confDen>0?x.weightedConfidence/x.confDen:0;
    const mixTotal=Object.values(x.leverageMix).reduce((s,v)=>s+v,0)||1;
    const mix=Object.fromEntries(
      Object.entries(x.leverageMix).map(([k,v])=>[k,round(v/mixTotal*100,2)])
    );

    return {
      side:x.side,
      priceLow:round(x.low,2),
      priceHigh:round(x.high,2),
      centerPrice:round(x.center,2),
      distanceFromCurrentPercent:round((x.center-input.currentPrice)/input.currentPrice*100,4),
      intensity:round(intensity,2),
      confidence:round(clamp(confidence,0,95),2),
      estimatedRiskUsd:round(x.riskUsd,2),
      sourceClusterCount:x.sourceClusters.size,
      contributingClusterCenters:[...x.clusterCenters].sort((a,b)=>a-b).map(v=>round(v,2)),
      leverageMix:mix,
    };
  });

  const longZones=zones.filter(z=>z.side==="long").sort((a,b)=>b.centerPrice-a.centerPrice);
  const shortZones=zones.filter(z=>z.side==="short").sort((a,b)=>a.centerPrice-b.centerPrice);

  const nearestLongZone=[...longZones]
    .filter(z=>z.centerPrice<input.currentPrice)
    .sort((a,b)=>Math.abs(a.centerPrice-input.currentPrice)-Math.abs(b.centerPrice-input.currentPrice))[0]??null;

  const nearestShortZone=[...shortZones]
    .filter(z=>z.centerPrice>input.currentPrice)
    .sort((a,b)=>Math.abs(a.centerPrice-input.currentPrice)-Math.abs(b.centerPrice-input.currentPrice))[0]??null;

  const strongestLongZone=[...longZones].sort((a,b)=>b.intensity-a.intensity)[0]??null;
  const strongestShortZone=[...shortZones].sort((a,b)=>b.intensity-a.intensity)[0]??null;

  return {
    symbol:"BTCUSDT",
    calculatedAt:new Date().toISOString(),
    currentPrice:round(input.currentPrice,2),
    sourceMapId:input.sourceMapId??null,
    maintenanceMarginRate:mmr,
    leverageDistribution:levs,
    longZones,
    shortZones,
    nearestLongZone,
    nearestShortZone,
    strongestLongZone,
    strongestShortZone,
    strategyVersion:"estimated-liquidation-map-v7.13",
  };
}
