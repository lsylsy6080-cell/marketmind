import type { CoverageDiagnosis, Distribution, NumericStats, SignalAuditResult } from "./types";

type Row = Record<string, any>;
const r4=(v:number)=>Math.round(v*10000)/10000;
function stats(values:number[]):NumericStats { const a=values.filter(Number.isFinite).sort((x,y)=>x-y); if(!a.length)return{min:null,max:null,mean:null,median:null,stdDev:null,p10:null,p90:null}; const mean=a.reduce((s,v)=>s+v,0)/a.length; const q=(p:number)=>a[Math.min(a.length-1,Math.max(0,Math.floor((a.length-1)*p)))]; const med=a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2; const sd=Math.sqrt(a.reduce((s,v)=>s+(v-mean)**2,0)/a.length); return{min:r4(a[0]),max:r4(a.at(-1)!),mean:r4(mean),median:r4(med),stdDev:r4(sd),p10:r4(q(.1)),p90:r4(q(.9))}; }
function dist(rows:Row[]):Distribution { const bullish=rows.filter(x=>x.direction==="bullish").length,bearish=rows.filter(x=>x.direction==="bearish").length,neutral=rows.length-bullish-bearish,n=rows.length||1; return{count:rows.length,bullish,neutral,bearish,bullishRatio:r4(bullish/n),neutralRatio:r4(neutral/n),bearishRatio:r4(bearish/n)}; }
function diagnose(count:number, active:number, sourceActivity:number):CoverageDiagnosis { if(count<20)return "insufficient_data"; if(sourceActivity<=0)return "source_inactive"; const rate=active/count; if(rate<.05)return "too_conservative"; return "healthy"; }
export function auditSignals(newsRows:Row[], fundingRows:Row[], windowHours=168):SignalAuditResult {
 const nd=dist(newsRows), fd=dist(fundingRows); const na=nd.bullish+nd.bearish, fa=fd.bullish+fd.bearish;
 const newsArticleCounts=newsRows.map(x=>Number(x.unique_article_count??x.article_count??0));
 const newsDiag=diagnose(nd.count,na,newsArticleCounts.reduce((s,v)=>s+v,0));
 const bp=fundingRows.map(x=>Number(x.funding_rate)*10000);
 const fundDiag=diagnose(fd.count,fa,fd.count);
 const newsReasons:string[]=[]; if(newsDiag==="too_conservative")newsReasons.push(`방향 신호 발생률 ${r4(na/(nd.count||1)*100)}%로 매우 낮습니다. 현재 News 방향 threshold(57/43)를 점검할 필요가 있습니다.`); if(newsArticleCounts.reduce((s,v)=>s+v,0)===0)newsReasons.push("분석 창에 뉴스 기사 입력이 없어 source_inactive로 판단했습니다."); if(nd.count<20)newsReasons.push("News score 표본이 20건 미만이라 진단을 보류합니다.");
 const fundReasons:string[]=[]; if(fundDiag==="too_conservative")fundReasons.push(`방향 신호 발생률 ${r4(fa/(fd.count||1)*100)}%로 매우 낮습니다. 현재 Funding score threshold(57/43)는 약 ±2.8bp 이상에서만 방향 신호가 발생합니다.`); if(fd.count<20)fundReasons.push("Funding snapshot 표본이 20건 미만이라 진단을 보류합니다.");
 const overall:CoverageDiagnosis = newsDiag==="source_inactive"?"source_inactive":(newsDiag==="too_conservative"||fundDiag==="too_conservative")?"too_conservative":(newsDiag==="insufficient_data"||fundDiag==="insufficient_data")?"insufficient_data":"healthy";
 const rec:string[]=[]; if(newsDiag==="too_conservative")rec.push("News threshold를 바로 변경하지 말고 score 분포(p10/p90)와 기사 수를 기준으로 7-3A.3 calibration 후보를 계산합니다."); if(fundDiag==="too_conservative")rec.push("Funding은 방향 예측보다 crowding/contrarian risk 역할이 강하므로 별도 역할 점수로 분리하는 것을 우선 검토합니다."); if(overall==="healthy")rec.push("현재 coverage는 정상 범위입니다. threshold 자동 변경은 필요하지 않습니다.");
 return {symbol:"BTCUSDT",calculatedAt:new Date().toISOString(),windowHours,news:{distribution:nd,score:stats(newsRows.map(x=>Number(x.weighted_score))),articleCount:stats(newsArticleCounts),activeSignalRate:r4(na/(nd.count||1)),diagnosis:newsDiag,reasons:newsReasons},funding:{distribution:fd,score:stats(fundingRows.map(x=>Number(x.score))),fundingBasisPoints:stats(bp),activeSignalRate:r4(fa/(fd.count||1)),thresholdReach:{bullish:fd.bullish,bearish:fd.bearish,neutral:fd.neutral},diagnosis:fundDiag,reasons:fundReasons},overallDiagnosis:overall,recommendations:rec,strategyVersion:"signal-coverage-audit-v2.3a2"};
}
