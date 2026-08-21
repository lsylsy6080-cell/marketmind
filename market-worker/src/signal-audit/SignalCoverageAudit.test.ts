import { auditSignals } from "./SignalCoverageAudit";
function ok(name:string,v:boolean){if(!v)throw new Error(`[FAIL] ${name}`);console.log(`[PASS] ${name}`)}
const neutralNews=Array.from({length:30},(_,i)=>({weighted_score:50, direction:"neutral",unique_article_count:5}));
const mixedFunding=Array.from({length:30},(_,i)=>({score:i%3===0?60:i%3===1?40:50,direction:i%3===0?"bullish":i%3===1?"bearish":"neutral",funding_rate:i%3===0?-.0004:i%3===1?.0004:0}));
let r=auditSignals(neutralNews,mixedFunding); ok("News 방향 신호가 거의 없으면 too_conservative",r.news.diagnosis==="too_conservative"); ok("Funding 방향 신호가 충분하면 healthy",r.funding.diagnosis==="healthy");
r=auditSignals(neutralNews.slice(0,5),mixedFunding.slice(0,5)); ok("표본 20건 미만은 insufficient_data",r.news.diagnosis==="insufficient_data");
