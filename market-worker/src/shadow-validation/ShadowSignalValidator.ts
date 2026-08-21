import type {
  Direction,
  FundingShadowResult,
  NewsShadowResult,
  ShadowValidationResult,
  SignalMetric,
} from "./types";

type Row = Record<string, unknown>;
export interface PricePoint { at: string; close: number; }

const LEGACY_NEWS = { bearish: 43, bullish: 57 } as const;
const RETURN_THRESHOLD = 0.1;
const MIN_SIGNAL_COUNT = 20;
const round = (v: number, d=4) => { const s=10**d; return Math.round(v*s)/s; };
const finite = (xs:number[]) => xs.filter(Number.isFinite).sort((a,b)=>a-b);
function q(xs:number[], p:number): number | null { const a=finite(xs); if(!a.length)return null; const i=(a.length-1)*p,l=Math.floor(i),h=Math.ceil(i); if(l===h)return a[l]; const w=i-l; return a[l]*(1-w)+a[h]*w; }
function splitRows(rows:Row[], ratio:number): {train:Row[]; test:Row[]} { const sorted=[...rows].sort((a,b)=>new Date(String(a.at??a.calculated_at??a.fetched_at)).getTime()-new Date(String(b.at??b.calculated_at??b.fetched_at)).getTime()); const cut=Math.max(1,Math.min(sorted.length-1,Math.floor(sorted.length*ratio))); return {train:sorted.slice(0,cut),test:sorted.slice(cut)}; }
function newsDirection(score:number, thresholds:{bearish:number;bullish:number}): Direction { return score>=thresholds.bullish?"bullish":score<=thresholds.bearish?"bearish":"neutral"; }
function nearestPrice(prices:PricePoint[], target:number): number | null { let lo=0,hi=prices.length-1,ans=-1; while(lo<=hi){const mid=(lo+hi)>>1; if(new Date(prices[mid].at).getTime()>=target){ans=mid;hi=mid-1;}else lo=mid+1;} return ans>=0?prices[ans].close:null; }
function futureReturns(at:string, prices:PricePoint[]): {r1:number|null;r4:number|null;r24:number|null} { const t=new Date(at).getTime(); const base=nearestPrice(prices,t); if(base==null||base<=0)return{r1:null,r4:null,r24:null}; const calc=(hours:number)=>{const p=nearestPrice(prices,t+hours*3600_000); return p==null?null:((p-base)/base)*100;}; return {r1:calc(1),r4:calc(4),r24:calc(24)}; }
function metric(signals:{direction:Direction; at:string}[], prices:PricePoint[], total:number): SignalMetric {
  const active=signals.filter(s=>s.direction!=="neutral");
  const horizons:["r1"|"r4"|"r24", "accuracy1h"|"accuracy4h"|"accuracy24h", "avgDirectionalReturn1h"|"avgDirectionalReturn4h"|"avgDirectionalReturn24h"][]=[
    ["r1","accuracy1h","avgDirectionalReturn1h"],["r4","accuracy4h","avgDirectionalReturn4h"],["r24","accuracy24h","avgDirectionalReturn24h"]];
  const out:any={signalCount:active.length,signalRate:total?round(active.length/total):0,bullishCount:active.filter(s=>s.direction==="bullish").length,bearishCount:active.filter(s=>s.direction==="bearish").length};
  for(const [rk,ak,dk] of horizons){ let n=0,correct=0,sum=0; for(const s of active){const r=futureReturns(s.at,prices)[rk]; if(r==null)continue; n++; const sign=s.direction==="bullish"?1:-1; const directional=sign*r; sum+=directional; if(directional>RETURN_THRESHOLD)correct++;} out[ak]=n?round(correct/n):null; out[dk]=n?round(sum/n):null; }
  return out as SignalMetric;
}
function composite(m:SignalMetric): number | null { const vals=[m.accuracy1h,m.accuracy4h,m.accuracy24h].filter((x):x is number=>x!=null); if(!vals.length)return null; const acc=vals.reduce((a,b)=>a+b,0)/vals.length; const ret=[m.avgDirectionalReturn1h,m.avgDirectionalReturn4h,m.avgDirectionalReturn24h].filter((x):x is number=>x!=null); const avgRet=ret.length?ret.reduce((a,b)=>a+b,0)/ret.length:0; return acc + Math.max(-0.2,Math.min(0.2,avgRet/10)); }

export function validateNews(newsRows:Row[], prices:PricePoint[], calibrationRatio=0.7): NewsShadowResult {
  const normalized=newsRows.map(r=>({...r,at:String(r.calculated_at),score:Number(r.weighted_score)})).filter(r=>Number.isFinite(r.score));
  const {train,test}=splitRows(normalized,calibrationRatio); const scores=train.map(r=>Number(r.score));
  const bearish=q(scores,0.1)??LEGACY_NEWS.bearish, bullish=q(scores,0.9)??LEGACY_NEWS.bullish;
  const legacySignals=test.map(r=>({at:String(r.at),direction:newsDirection(Number(r.score),LEGACY_NEWS)}));
  const candidateSignals=test.map(r=>({at:String(r.at),direction:newsDirection(Number(r.score),{bearish,bullish})}));
  const legacy=metric(legacySignals,prices,test.length), candidate=metric(candidateSignals,prices,test.length);
  const enough=candidate.signalCount>=MIN_SIGNAL_COUNT; const lc=composite(legacy),cc=composite(candidate);
  const verdict=!enough||cc==null?"inconclusive":lc==null||cc>lc+0.03?"candidate_better":cc<lc-0.03?"legacy_better":"inconclusive";
  const reasons=[`앞 ${Math.round(calibrationRatio*100)}% 표본에서 P10/P90=${round(bearish)}/${round(bullish)}를 고정하고 뒤 표본에서만 검증했습니다.`,`Candidate validation 신호 ${candidate.signalCount}건 (${round(candidate.signalRate*100,2)}%).`];
  if(!enough) reasons.push(`Candidate 방향 신호가 ${MIN_SIGNAL_COUNT}건 미만이라 성과 판정은 보류합니다.`);
  return {calibrationSamples:train.length,validationSamples:test.length,legacyThresholds:LEGACY_NEWS,candidateThresholds:{bearish:round(bearish),bullish:round(bullish)},legacy,candidate,candidateStatus:enough?"validated":"insufficient_signals",verdict,reasons};
}

function percentileRank(train:number[], current:number): number { const a=finite(train); if(!a.length)return .5; const below=a.filter(v=>v<current).length,equal=a.filter(v=>v===current).length; return (below+equal*.5)/a.length; }
export function validateFunding(fundingRows:Row[], prices:PricePoint[], calibrationRatio=0.7): FundingShadowResult {
  const normalized=fundingRows.map(r=>({...r,at:String(r.fetched_at),bp:Number(r.funding_rate)*10000,legacyDirection:String(r.direction) as Direction})).filter(r=>Number.isFinite(r.bp));
  const {train,test}=splitRows(normalized,calibrationRatio); const trainBp=train.map(r=>Number(r.bp)); const p10=q(trainBp,.1),median=q(trainBp,.5),p90=q(trainBp,.9),max=trainBp.length?Math.max(...trainBp):null;
  const saturationRatio=max==null?0:trainBp.filter(v=>Math.abs(v-max)<1e-9).length/trainBp.length;
  const legacySignals=test.map(r=>{ const legacy=String(r.legacyDirection); const direction:Direction=legacy==="bullish"?"bullish":legacy==="bearish"?"bearish":"neutral"; return {at:String(r.at),direction}; });
  const crowdingSignals=test.map(r=>{const bp=Number(r.bp),p=percentileRank(trainBp,bp); let direction:Direction="neutral"; if(bp>0&&p>=.9&&Math.abs(bp)>=1.5)direction="bearish"; else if(bp<0&&p<=.1&&Math.abs(bp)>=1.5)direction="bullish"; return{at:String(r.at),direction};});
  const legacy=metric(legacySignals,prices,test.length), crowdingCandidate=metric(crowdingSignals,prices,test.length);
  const saturated=saturationRatio>=.2 && p90!=null && max!=null && Math.abs(p90-max)<1e-9;
  const enough=crowdingCandidate.signalCount>=MIN_SIGNAL_COUNT; const lc=composite(legacy),cc=composite(crowdingCandidate);
  const verdict=saturated||!enough||cc==null?"inconclusive":lc==null||cc>lc+.03?"crowding_better":cc<lc-.03?"legacy_better":"inconclusive";
  const reasons=[`Funding calibration 분포 P10/Median/P90=${p10==null?"-":round(p10)}/${median==null?"-":round(median)}/${p90==null?"-":round(p90)}bp.`,`최댓값 반복 비율 ${round(saturationRatio*100,2)}%.`];
  if(saturated)reasons.push("상단 분포가 동일 값에 포화되어 percentile 기반 crowding 방향 검증을 보류합니다. 수집 오류로 단정하지 않고 원본 분포 특성을 추가 확인해야 합니다.");
  else if(!enough)reasons.push(`Crowding 방향 신호가 ${MIN_SIGNAL_COUNT}건 미만이라 성과 판정은 보류합니다.`);
  return {calibrationSamples:train.length,validationSamples:test.length,p10BasisPoints:p10==null?null:round(p10),medianBasisPoints:median==null?null:round(median),p90BasisPoints:p90==null?null:round(p90),maxBasisPoints:max==null?null:round(max),saturationRatioAtMax:round(saturationRatio),legacy,crowdingCandidate,candidateStatus:saturated?"distribution_saturated":enough?"validated":"insufficient_signals",verdict,reasons};
}

export function buildShadowValidation(params:{newsRows:Row[];fundingRows:Row[];prices:PricePoint[];windowHours?:number;calibrationRatio?:number}): ShadowValidationResult {
  const ratio=params.calibrationRatio??.7; const news=validateNews(params.newsRows,params.prices,ratio); const funding=validateFunding(params.fundingRows,params.prices,ratio);
  let overall:ShadowValidationResult["overallVerdict"]="insufficient_evidence";
  if(news.verdict==="candidate_better" && (funding.verdict==="crowding_better"||funding.verdict==="inconclusive")) overall="candidate_promising";
  else if(news.candidateStatus==="validated"||funding.candidateStatus==="validated") overall="keep_observation";
  const recommendations:string[]=[];
  if(news.verdict==="candidate_better") recommendations.push("News dynamic threshold 후보가 shadow validation에서 우세합니다. 다음 단계에서 제한적 shadow 적용을 검토합니다.");
  else recommendations.push("News candidate가 아직 우세하다고 확정할 수 없습니다. observation-only를 유지합니다.");
  if(funding.candidateStatus==="distribution_saturated") recommendations.push("Funding 상단 분포 포화가 확인되어 crowding 방향 적용을 보류하고 원본 funding 분포/수집 주기를 점검합니다.");
  else if(funding.verdict==="crowding_better") recommendations.push("Funding crowding contrarian 후보가 legacy 방향모델보다 우세합니다.");
  return {symbol:"BTCUSDT",calculatedAt:new Date().toISOString(),windowHours:params.windowHours??168,calibrationRatio:ratio,validationReturnThresholdPercent:RETURN_THRESHOLD,news,funding,overallVerdict:overall,recommendations,strategyVersion:"shadow-signal-validation-v2.3a4"};
}
