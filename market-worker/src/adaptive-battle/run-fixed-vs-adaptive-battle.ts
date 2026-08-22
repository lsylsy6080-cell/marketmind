import "dotenv/config";
import { supabase } from "../lib/supabase";
import { evaluateFixedVsAdaptiveBattle } from "./FixedVsAdaptiveBattleEngine";
import type { BattleTrade } from "./types";

const MIN_TRADES=Number(process.env.ADAPTIVE_BATTLE_MIN_TRADES ?? 30);

const n=(v:unknown,f=0)=>{const x=Number(v);return Number.isFinite(x)?x:f};

async function getBattleConfig(fixedInitialBalance:number,adaptiveInitialBalance:number){
  const {data,error}=await supabase.from("adaptive_battle_configs").select("*").eq("symbol","BTCUSDT").eq("is_active",true).limit(1).maybeSingle();
  if(error) throw new Error(`[Battle] config 조회 실패: ${error.message}`);
  if(data) return data;
  const {data:inserted,error:insertError}=await supabase.from("adaptive_battle_configs").insert({
    symbol:"BTCUSDT",
    minimum_trades:MIN_TRADES,
    fixed_initial_balance:fixedInitialBalance,
    adaptive_initial_balance:adaptiveInitialBalance,
  }).select("*").single();
  if(insertError||!inserted) throw new Error(`[Battle] config 생성 실패: ${insertError?.message??"unknown"}`);
  return inserted;
}
async function getFixedAccount(){
  const {data,error}=await supabase.from("paper_strategy_configs").select("account_id,symbol").eq("symbol","BTCUSDT").eq("is_active",true).order("id",{ascending:true}).limit(1).maybeSingle();
  if(error||!data) throw new Error(`[Battle] fixed config/account 조회 실패: ${error?.message??"none"}`);
  const account=await supabase.from("paper_trading_accounts").select("id,cash_balance").eq("id",data.account_id).single();
  if(account.error||!account.data) throw new Error(`[Battle] fixed account 조회 실패: ${account.error?.message??"none"}`);
  return {id:data.account_id,initialBalance:n(account.data.cash_balance,10000)};
}
async function getAdaptiveAccount(){
  const {data,error}=await supabase.from("adaptive_paper_accounts").select("id,cash_balance,initial_balance").eq("is_active",true).order("id",{ascending:true}).limit(1).maybeSingle();
  if(error||!data) throw new Error(`[Battle] adaptive account 조회 실패: ${error?.message??"none"}`);
  const equity=await supabase.from("adaptive_paper_equity_snapshots")
    .select("equity").eq("account_id",data.id).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(equity.error) throw new Error(`[Battle] adaptive equity 조회 실패: ${equity.error.message}`);
  return {id:data.id,initialBalance:n(equity.data?.equity,n(data.cash_balance,n(data.initial_balance,10000)))};
}
async function getFixedTrades(accountId:number,startedAt:string):Promise<BattleTrade[]>{
  const {data,error}=await supabase.from("paper_trades")
    .select("net_pnl,return_percent,closed_at,holding_seconds")
    .eq("account_id",accountId).eq("symbol","BTCUSDT").gte("closed_at",startedAt).order("closed_at",{ascending:true}).limit(5000);
  if(error) throw new Error(`[Battle] fixed trades 조회 실패: ${error.message}`);
  return (data??[]).map((r:any)=>({netPnl:n(r.net_pnl),returnPercent:r.return_percent==null?null:n(r.return_percent),feeAmount:0,holdingSeconds:r.holding_seconds==null?null:n(r.holding_seconds),closedAt:r.closed_at}));
}
async function getAdaptiveTrades(accountId:number,startedAt:string):Promise<BattleTrade[]>{
  const {data,error}=await supabase.from("adaptive_paper_trades")
    .select("net_pnl,return_on_equity_percent,entry_fee,exit_fee,opened_at,closed_at,leverage,leverage_adjusted")
    .eq("account_id",accountId).eq("symbol","BTCUSDT").gte("closed_at",startedAt).order("closed_at",{ascending:true}).limit(5000);
  if(error) throw new Error(`[Battle] adaptive trades 조회 실패: ${error.message}`);
  return (data??[]).map((r:any)=>({
    netPnl:n(r.net_pnl),returnPercent:r.return_on_equity_percent==null?null:n(r.return_on_equity_percent),
    feeAmount:n(r.entry_fee)+n(r.exit_fee),holdingSeconds:Math.max(0,(new Date(r.closed_at).getTime()-new Date(r.opened_at).getTime())/1000),
    closedAt:r.closed_at,leverage:n(r.leverage),leverageAdjusted:Boolean(r.leverage_adjusted),
  }));
}
export async function runFixedVsAdaptiveBattle(){
  const [fixedAccount,adaptiveAccount]=await Promise.all([getFixedAccount(),getAdaptiveAccount()]);
  const config=await getBattleConfig(fixedAccount.initialBalance,adaptiveAccount.initialBalance);
  const [fixedTrades,adaptiveTrades]=await Promise.all([
    getFixedTrades(fixedAccount.id,config.started_at),
    getAdaptiveTrades(adaptiveAccount.id,config.started_at),
  ]);
  const result=evaluateFixedVsAdaptiveBattle({
    startedAt:config.started_at,fixedTrades,adaptiveTrades,
    fixedInitialBalance:n(config.fixed_initial_balance,fixedAccount.initialBalance),
    adaptiveInitialBalance:n(config.adaptive_initial_balance,adaptiveAccount.initialBalance),
    minimumTradesRequired:n(config.minimum_trades,MIN_TRADES),
  });
  const {error}=await supabase.from("adaptive_battle_snapshots").insert({
    battle_config_id:config.id,symbol:"BTCUSDT",status:result.status,winner:result.winner,
    fixed_metrics:result.fixed,adaptive_metrics:result.adaptive,fixed_score:result.fixedScore,
    adaptive_score:result.adaptiveScore,reasons:result.reasons,analyzed_at:result.analyzedAt,
  });
  if(error) throw new Error(`[Battle] snapshot 저장 실패: ${error.message}`);
  return result;
}
