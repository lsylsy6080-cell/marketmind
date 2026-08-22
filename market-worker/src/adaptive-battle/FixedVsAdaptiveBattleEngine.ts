import type { BattleScore,BattleTrade,FixedVsAdaptiveBattleResult,StrategyBattleMetrics } from "./types";
const round=(v:number,d=6)=>{const m=10**d;return Math.round(v*m)/m};
const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const finite=(a:(number|null|undefined)[])=>a.filter((v):v is number=>typeof v==="number"&&Number.isFinite(v));

export function calculateBattleMetrics(trades:BattleTrade[],initialBalance:number):StrategyBattleMetrics{
  if(!Number.isFinite(initialBalance)||initialBalance<=0) throw new Error("initialBalance must be > 0");
  const ordered=[...trades].sort((a,b)=>new Date(a.closedAt).getTime()-new Date(b.closedAt).getTime());
  let gp=0,gl=0,equity=initialBalance,peak=initialBalance,mdd=0;
  for(const t of ordered){
    if(t.netPnl>0)gp+=t.netPnl; if(t.netPnl<0)gl+=Math.abs(t.netPnl);
    equity+=t.netPnl; peak=Math.max(peak,equity); mdd=Math.max(mdd,peak>0?(peak-equity)/peak*100:0);
  }
  const wins=ordered.filter(t=>t.netPnl>0).length, losses=ordered.filter(t=>t.netPnl<0).length;
  const net=ordered.reduce((s,t)=>s+t.netPnl,0), fees=ordered.reduce((s,t)=>s+t.feeAmount,0);
  const rets=finite(ordered.map(t=>t.returnPercent)), holds=finite(ordered.map(t=>t.holdingSeconds)), levs=finite(ordered.map(t=>t.leverage));
  const adjusted=ordered.filter(t=>typeof t.leverageAdjusted==="boolean");
  return {
    totalTrades:ordered.length,winningTrades:wins,losingTrades:losses,breakevenTrades:ordered.length-wins-losses,
    winRate:ordered.length?round(wins/ordered.length*100,4):null,netPnl:round(net),netReturnPercent:round(net/initialBalance*100,4),
    averagePnl:ordered.length?round(net/ordered.length):null,
    expectancyPercent:rets.length?round(rets.reduce((s,v)=>s+v,0)/rets.length,4):null,
    profitFactor:gl>0?round(gp/gl,4):(gp>0?999:null),maxDrawdownPercent:round(mdd,4),totalFees:round(fees),
    feeToGrossProfitPercent:gp>0?round(fees/gp*100,4):null,
    averageHoldingMinutes:holds.length?round(holds.reduce((s,v)=>s+v,0)/holds.length/60,2):null,
    averageLeverage:levs.length?round(levs.reduce((s,v)=>s+v,0)/levs.length,2):null,
    leverageAdjustmentRate:adjusted.length?round(adjusted.filter(t=>t.leverageAdjusted===true).length/adjusted.length*100,2):null,
  };
}
function pair(a:number,b:number):[number,number]{
  if(Math.abs(a-b)<1e-9)return[50,50]; const span=Math.max(Math.abs(a),Math.abs(b),1e-9),d=clamp((a-b)/span,-1,1);
  return [round(50+d*50,2),round(50-d*50,2)];
}
export function scoreBattlePair(f:StrategyBattleMetrics,a:StrategyBattleMetrics):{fixed:BattleScore;adaptive:BattleScore}{
  const [fr,ar]=pair(f.netReturnPercent,a.netReturnPercent);
  const [fd,ad]=pair(-f.maxDrawdownPercent,-a.maxDrawdownPercent);
  const [fp,ap]=pair(Math.min(f.profitFactor??0,5),Math.min(a.profitFactor??0,5));
  const [fe,ae]=pair(f.expectancyPercent??0,a.expectancyPercent??0);
  const [fc,ac]=pair((f.winRate??0)-f.maxDrawdownPercent,(a.winRate??0)-a.maxDrawdownPercent);
  const build=(r:number,d:number,pf:number,e:number,c:number):BattleScore=>({total:round(r*.30+d*.25+pf*.20+e*.15+c*.10,2),returnScore:r,drawdownScore:d,profitFactorScore:pf,expectancyScore:e,consistencyScore:c});
  return {fixed:build(fr,fd,fp,fe,fc),adaptive:build(ar,ad,ap,ae,ac)};
}
export function evaluateFixedVsAdaptiveBattle(input:{startedAt:string;analyzedAt?:string;fixedTrades:BattleTrade[];adaptiveTrades:BattleTrade[];fixedInitialBalance:number;adaptiveInitialBalance:number;minimumTradesRequired?:number;}):FixedVsAdaptiveBattleResult{
  const min=Math.max(10,Math.trunc(input.minimumTradesRequired??30)),fixed=calculateBattleMetrics(input.fixedTrades,input.fixedInitialBalance),adaptive=calculateBattleMetrics(input.adaptiveTrades,input.adaptiveInitialBalance),analyzedAt=input.analyzedAt??new Date().toISOString();
  if(fixed.totalTrades<min||adaptive.totalTrades<min)return{status:"warming_up",winner:"inconclusive",startedAt:input.startedAt,analyzedAt,fixed,adaptive,fixedScore:null,adaptiveScore:null,minimumTradesRequired:min,reasons:[`Forward 표본 대기: Fixed ${fixed.totalTrades}/${min}, Adaptive ${adaptive.totalTrades}/${min}.`]};
  const scores=scoreBattlePair(fixed,adaptive),delta=scores.adaptive.total-scores.fixed.total;
  const winner=delta>=5?"adaptive":delta<=-5?"fixed":"tie";
  return{status:"comparable",winner,startedAt:input.startedAt,analyzedAt,fixed,adaptive,fixedScore:scores.fixed,adaptiveScore:scores.adaptive,minimumTradesRequired:min,reasons:[`종합점수 Fixed ${scores.fixed.total} vs Adaptive ${scores.adaptive.total}.`,`누적수익률 Adaptive-Fixed ${round(adaptive.netReturnPercent-fixed.netReturnPercent,2)}%p · MDD 개선 ${round(fixed.maxDrawdownPercent-adaptive.maxDrawdownPercent,2)}%p.`,...(winner==="tie"?["점수 차이가 5점 미만이라 우열을 확정하지 않습니다."]:[])]};
}
