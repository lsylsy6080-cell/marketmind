import type { CorrelationCandle, CorrelationState, CorrelationTimeframe, CorrelationTimeframeResult, LeadLagLeader, Phase82CorrelationResult } from "./types";

const TF_WEIGHT: Record<CorrelationTimeframe, number> = { "15m": 0.25, "1h": 0.4, "4h": 0.35 };
const clamp=(v:number,min:number,max:number)=>Math.min(Math.max(v,min),max);
const round=(v:number,d=4)=>{const s=10**d;return Math.round(v*s)/s};

function pearson(a:number[],b:number[]):number{
  const n=Math.min(a.length,b.length); if(n<3)return 0;
  const x=a.slice(-n),y=b.slice(-n);
  const mx=x.reduce((s,v)=>s+v,0)/n,my=y.reduce((s,v)=>s+v,0)/n;
  let num=0,xx=0,yy=0;
  for(let i=0;i<n;i++){const dx=x[i]-mx,dy=y[i]-my;num+=dx*dy;xx+=dx*dx;yy+=dy*dy;}
  if(xx===0||yy===0)return 0;
  return clamp(num/Math.sqrt(xx*yy),-1,1);
}
function logReturns(values:number[]):number[]{const out:number[]=[];for(let i=1;i<values.length;i++){if(values[i-1]>0&&values[i]>0)out.push(Math.log(values[i]/values[i-1]));}return out;}
function totalReturnPercent(values:number[],lookback=20):number{if(values.length<2)return 0;const end=values.at(-1)!,start=values[Math.max(0,values.length-1-lookback)];return start>0?((end/start)-1)*100:0;}
function classifyState(c:number,d:number):CorrelationState{if(c<0.45||d>=65)return "decoupled";if(c<0.8||d>=35)return "diverging";return "synchronized";}
function leadLag(spot:number[],futures:number[]):{leader:LeadLagLeader;strength:number}{
  const n=Math.min(spot.length,futures.length);if(n<8)return{leader:"none",strength:0};
  const s=spot.slice(-n),f=futures.slice(-n);
  const spotLeads=pearson(s.slice(0,-1),f.slice(1));
  const futuresLeads=pearson(f.slice(0,-1),s.slice(1));
  const gap=Math.abs(spotLeads-futuresLeads);
  if(gap<0.05)return{leader:"none",strength:round(gap)};
  return{leader:spotLeads>futuresLeads?"spot":"futures",strength:round(gap)};
}

export function analyzeTimeframeCorrelation(params:{timeframe:CorrelationTimeframe;spotCandles:CorrelationCandle[];futuresCandles:CorrelationCandle[]}):CorrelationTimeframeResult{
  const spotMap=new Map(params.spotCandles.map(c=>[c.openTime,c.close]));
  const paired=params.futuresCandles.filter(c=>spotMap.has(c.openTime)).map(c=>({spot:spotMap.get(c.openTime)!,futures:c.close}));
  if(paired.length<30)throw new Error(`${params.timeframe} 상관분석 표본 부족: ${paired.length}개`);
  const spotCloses=paired.map(x=>x.spot),futuresCloses=paired.map(x=>x.futures);
  const spotReturns=logReturns(spotCloses),futuresReturns=logReturns(futuresCloses);
  const correlation=pearson(spotReturns,futuresReturns);
  const spotReturnPercent=totalReturnPercent(spotCloses),futuresReturnPercent=totalReturnPercent(futuresCloses);
  const returnGapPercent=futuresReturnPercent-spotReturnPercent;
  const basisPercent=((futuresCloses.at(-1)!/spotCloses.at(-1)!)-1)*100;
  const lag=leadLag(spotReturns,futuresReturns);
  const divergenceScore=clamp((1-clamp(correlation,0,1))*65+Math.min(Math.abs(returnGapPercent)*12,20)+Math.min(Math.abs(basisPercent)*35,15),0,100);
  return { timeframe:params.timeframe,pairCount:paired.length,returnCorrelation:round(correlation),spotReturnPercent:round(spotReturnPercent),futuresReturnPercent:round(futuresReturnPercent),returnGapPercent:round(returnGapPercent),basisPercent:round(basisPercent),leadLagLeader:lag.leader,leadLagStrength:lag.strength,state:classifyState(correlation,divergenceScore),divergenceScore:round(divergenceScore,2)};
}

export function aggregateCorrelationIntelligence(details:CorrelationTimeframeResult[],now=new Date()):Omit<Phase82CorrelationResult,"performance">{
  if(details.length!==3)throw new Error(`Phase 8-2에는 15m/1h/4h 3개 시간봉이 필요합니다. 현재 ${details.length}개입니다.`);
  const weightSum=details.reduce((s,x)=>s+TF_WEIGHT[x.timeframe],0);
  const weighted=(fn:(x:CorrelationTimeframeResult)=>number)=>details.reduce((s,x)=>s+fn(x)*TF_WEIGHT[x.timeframe],0)/weightSum;
  const overallCorrelation=weighted(x=>x.returnCorrelation),overallDivergenceScore=weighted(x=>x.divergenceScore);
  const state=classifyState(overallCorrelation,overallDivergenceScore);
  const maxBasis=Math.max(...details.map(x=>Math.abs(x.basisPercent)));
  const decoupledCount=details.filter(x=>x.state==="decoupled").length;
  const riskLevel:Phase82CorrelationResult["riskLevel"]=state==="decoupled"||decoupledCount>=2||maxBasis>=0.4?"high":state==="diverging"||maxBasis>=0.2?"normal":"low";
  const reasons=[`Spot/Futures 수익률 상관 ${round(overallCorrelation,3)}`,`종합 괴리 점수 ${round(overallDivergenceScore,1)}/100`];
  if(decoupledCount>0)reasons.push(`비동조 시간봉 ${decoupledCount}/3`);
  if(maxBasis>=0.2)reasons.push(`선물-현물 basis 확대 ${round(maxBasis,3)}%`);
  return {symbol:"BTCUSDT",calculatedAt:now.toISOString(),overallCorrelation:round(overallCorrelation),overallDivergenceScore:round(overallDivergenceScore,2),state,riskLevel,timeframeDetails:details,reasons,strategyVersion:"phase8-correlation-v8.2"};
}
