import { supabase } from "../lib/supabase";
import { runPhase86ContextExecutionGuard } from "../phase8-execution-guard/run-phase8-context-execution-guard";
import {
  buildAdaptiveExecutionPlan,
  determineAdaptiveCloseReason,
  evaluateAdaptiveSqueezeEntryGuard,
  evaluateAdaptiveSqueezeProtection,
} from "./AdaptiveExecutionEngine";
import type {
  AdaptivePaperCloseReason,
  AdaptivePaperSummary,
  AdaptiveSqueezeWarning,
} from "./types";

const BINANCE_TICKER_URL="https://api.binance.com/api/v3/ticker/price";
const FEE_RATE_PERCENT=Number(process.env.ADAPTIVE_PAPER_FEE_RATE_PERCENT ?? 0.04);
const TARGET_RR=Number(process.env.ADAPTIVE_PAPER_TARGET_RR ?? 1.5);
const MAINTENANCE_MARGIN_RATE_PERCENT=Number(process.env.ADAPTIVE_PAPER_MAINTENANCE_MARGIN_RATE_PERCENT ?? 0.5);
const LIQUIDATION_SAFETY_BUFFER_PERCENT=Number(process.env.ADAPTIVE_PAPER_LIQUIDATION_SAFETY_BUFFER_PERCENT ?? 1.0);

const num=(v:unknown,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f};
const round=(v:number,d=8)=>{const m=10**d;return Math.round(v*m)/m};

type V2Row={
  id:number; direction:"bullish"|"neutral"|"bearish"; calculated_at:string;
  entry_plan:any; entry_trigger:any; strategy_version:string;
  trading_permission:string|null;
  squeeze_warning_snapshot_id:number|null;
  squeeze_warning_status:string|null;
  squeeze_long_phase:string|null;
  squeeze_short_phase:string|null;
  squeeze_permission_override:string|null;
};
type SizingRow={
  id:number; decision_v2_id:number; sizing_status:string; margin_percent:number|string;
  leverage:number; sizing_score:number|string; risk_tier:string; apply_mode:string;
};
type AdaptiveAccount={id:number;base_account_id:number;initial_balance:number|string;cash_balance:number|string};
type AdaptivePosition={
  id:number;account_id:number;base_config_id:number|null;symbol:string;side:"long"|"short";
  quantity:number|string;entry_price:number|string;stop_loss_price:number|string;take_profit_price:number|string;
  margin_amount:number|string;notional_amount:number|string;opened_at:string;
  requested_leverage:number|string|null;estimated_liquidation_price:number|string|null;
  liquidation_distance_percent:number|string|null;liquidation_safety_buffer_percent:number|string|null;
  liquidation_safety_status:string|null;maintenance_margin_rate_percent:number|string|null;
  leverage_adjusted:boolean|null;
};
type ConfigRow={id:number;account_id:number;symbol:string;max_holding_minutes:number};

async function fetchPrice(symbol:string):Promise<number>{
  const url=new URL(BINANCE_TICKER_URL);url.searchParams.set("symbol",symbol);
  const response=await fetch(url,{signal:AbortSignal.timeout(12_000)});
  if(!response.ok) throw new Error(`[Adaptive Paper] Binance HTTP ${response.status}`);
  const body=await response.json() as {price?:unknown};
  const price=Number(body.price);
  if(!Number.isFinite(price)||price<=0) throw new Error("[Adaptive Paper] invalid Binance price");
  return price;
}

async function getBaseConfig():Promise<ConfigRow|null>{
  const {data,error}=await supabase.from("paper_strategy_configs")
    .select("id,account_id,symbol,max_holding_minutes")
    .eq("is_active",true).eq("symbol","BTCUSDT").order("id",{ascending:true}).limit(1).maybeSingle();
  if(error) throw new Error(`[Adaptive Paper] config 조회 실패: ${error.message}`);
  return data as ConfigRow|null;
}

async function ensureAccount(baseAccountId:number):Promise<AdaptiveAccount>{
  const existing=await supabase.from("adaptive_paper_accounts")
    .select("id,base_account_id,initial_balance,cash_balance")
    .eq("base_account_id",baseAccountId).maybeSingle();
  if(existing.error) throw new Error(`[Adaptive Paper] account 조회 실패: ${existing.error.message}`);
  if(existing.data) return existing.data as AdaptiveAccount;

  const base=await supabase.from("paper_trading_accounts")
    .select("id,cash_balance").eq("id",baseAccountId).single();
  if(base.error||!base.data) throw new Error(`[Adaptive Paper] base account 조회 실패: ${base.error?.message??"없음"}`);
  const balance=num(base.data.cash_balance);
  if(balance<=0) throw new Error("[Adaptive Paper] base account balance <= 0");

  const inserted=await supabase.from("adaptive_paper_accounts").insert({
    base_account_id:baseAccountId,initial_balance:balance,cash_balance:balance,
  }).select("id,base_account_id,initial_balance,cash_balance").single();
  if(inserted.error||!inserted.data) throw new Error(`[Adaptive Paper] account 생성 실패: ${inserted.error?.message??"없음"}`);
  return inserted.data as AdaptiveAccount;
}

async function getLatestV2():Promise<V2Row|null>{
  const {data,error}=await supabase.from("ai_decision_v2_snapshots")
    .select("id,direction,calculated_at,entry_plan,entry_trigger,strategy_version,trading_permission,squeeze_warning_snapshot_id,squeeze_warning_status,squeeze_long_phase,squeeze_short_phase,squeeze_permission_override")
    .eq("symbol","BTCUSDT").order("calculated_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error(`[Adaptive Paper] V2 조회 실패: ${error.message}`);
  return data as V2Row|null;
}

async function getSqueezeWarning(v2:V2Row|null):Promise<AdaptiveSqueezeWarning|null>{
  const snapshotId=num(v2?.squeeze_warning_snapshot_id);
  if(!v2 || snapshotId<=0 || v2.squeeze_warning_status!=="active") return null;

  const {data,error}=await supabase.from("squeeze_early_warning_snapshots")
    .select("id,calculated_at,long_phase,short_phase,long_alert_score,short_alert_score")
    .eq("id",snapshotId).maybeSingle();
  if(error) throw new Error(`[Adaptive Paper] squeeze warning 조회 실패: ${error.message}`);
  if(!data) return null;

  const ageMinutes=(Date.now()-new Date(String(data.calculated_at)).getTime())/60_000;
  if(!Number.isFinite(ageMinutes) || ageMinutes>5) return null;

  const validPhase=(v:unknown):AdaptiveSqueezeWarning["longPhase"]=>{
    const value=String(v);
    return ["WATCH","BUILDING","IMMINENT","ACTIVE","EXHAUSTION"].includes(value)
      ? value as AdaptiveSqueezeWarning["longPhase"]
      : "WATCH";
  };

  return {
    snapshotId:Number(data.id),
    observedAt:String(data.calculated_at),
    longPhase:validPhase(data.long_phase),
    shortPhase:validPhase(data.short_phase),
    longAlertScore:num(data.long_alert_score),
    shortAlertScore:num(data.short_alert_score),
  };
}

async function getSizing(decisionV2Id:number):Promise<SizingRow|null>{
  const {data,error}=await supabase.from("adaptive_position_sizing_snapshots")
    .select("id,decision_v2_id,sizing_status,margin_percent,leverage,sizing_score,risk_tier,apply_mode")
    .eq("decision_v2_id",decisionV2Id).order("calculated_at",{ascending:false}).limit(1).maybeSingle();
  if(error) throw new Error(`[Adaptive Paper] sizing 조회 실패: ${error.message}`);
  return data as SizingRow|null;
}

async function getOpenPosition(accountId:number):Promise<AdaptivePosition|null>{
  const {data,error}=await supabase.from("adaptive_paper_positions")
    .select("id,account_id,base_config_id,symbol,side,quantity,entry_price,stop_loss_price,take_profit_price,margin_amount,notional_amount,opened_at,requested_leverage,estimated_liquidation_price,liquidation_distance_percent,liquidation_safety_buffer_percent,liquidation_safety_status,maintenance_margin_rate_percent,leverage_adjusted")
    .eq("account_id",accountId).eq("symbol","BTCUSDT").eq("status","open").limit(1).maybeSingle();
  if(error) throw new Error(`[Adaptive Paper] open position 조회 실패: ${error.message}`);
  return data as AdaptivePosition|null;
}

async function saveEquitySnapshot(account:AdaptiveAccount,position:AdaptivePosition|null,marketPrice:number):Promise<void>{
  let margin=0,unrealized=0;
  if(position){
    margin=num(position.margin_amount);
    const q=num(position.quantity),entry=num(position.entry_price);
    unrealized=position.side==="long" ? (marketPrice-entry)*q : (entry-marketPrice)*q;
  }
  const fresh=await supabase.from("adaptive_paper_accounts").select("cash_balance").eq("id",account.id).single();
  if(fresh.error) throw new Error(`[Adaptive Paper] equity account refresh 실패: ${fresh.error.message}`);
  const cash=num(fresh.data.cash_balance);
  const {error}=await supabase.from("adaptive_paper_equity_snapshots").insert({
    account_id:account.id,symbol:"BTCUSDT",cash_balance:round(cash),
    reserved_margin:round(margin),unrealized_pnl:round(unrealized),
    equity:round(cash+margin+unrealized),market_price:marketPrice,
    open_position_id:position?.id??null,
  });
  if(error) throw new Error(`[Adaptive Paper] equity snapshot 실패: ${error.message}`);
}

export async function runAdaptivePaperTrading():Promise<AdaptivePaperSummary>{
  if(process.env.ADAPTIVE_PAPER_ENABLED==="false"){
    return {action:"skipped",reason:"ADAPTIVE_PAPER_ENABLED=false"};
  }

  const config=await getBaseConfig();
  if(!config) return {action:"skipped",reason:"활성 BTCUSDT paper config가 없습니다."};

  const account=await ensureAccount(config.account_id);
  const marketPrice=await fetchPrice("BTCUSDT");
  const v2=await getLatestV2();
  const squeezeWarning=await getSqueezeWarning(v2);
  const open=await getOpenPosition(account.id);

  if(open){
    const baseCloseReason=determineAdaptiveCloseReason({
      side:open.side,marketPrice,entryPrice:num(open.entry_price),
      stopLossPrice:num(open.stop_loss_price),takeProfitPrice:num(open.take_profit_price),
      openedAt:open.opened_at,maxHoldingMinutes:num(config.max_holding_minutes,120),
      triggerStatus:v2?.entry_trigger?.status,currentDirection:v2?.direction,
    });

    const squeezeProtection=evaluateAdaptiveSqueezeProtection({
      side:open.side,
      marketPrice,
      entryPrice:num(open.entry_price),
      currentStopLossPrice:num(open.stop_loss_price),
      warning:squeezeWarning,
    });

    let closeReason:AdaptivePaperCloseReason|null=baseCloseReason;
    if(!closeReason && squeezeProtection.action==="close"){
      closeReason="squeeze_active";
    }

    if(!closeReason && squeezeProtection.action==="tighten_stop" && squeezeProtection.newStopLossPrice!=null){
      const {error:protectError}=await supabase.from("adaptive_paper_positions").update({
        stop_loss_price:squeezeProtection.newStopLossPrice,
        squeeze_warning_snapshot_id:squeezeWarning?.snapshotId??null,
        squeeze_phase:squeezeProtection.relevantPhase,
        squeeze_alert_score:squeezeProtection.relevantAlertScore,
        squeeze_protection_action:"tighten_stop",
        squeeze_protective_stop_price:squeezeProtection.newStopLossPrice,
        squeeze_protection_updated_at:new Date().toISOString(),
      }).eq("id",open.id);
      if(protectError) throw new Error(`[Adaptive Paper] squeeze protective stop 저장 실패: ${protectError.message}`);

      const protectedPosition={...open,stop_loss_price:squeezeProtection.newStopLossPrice};
      await saveEquitySnapshot(account,protectedPosition,marketPrice);
      return {
        action:"held",
        positionId:open.id,
        reason:squeezeProtection.reason,
      };
    }

    if(!closeReason){
      await saveEquitySnapshot(account,open,marketPrice);
      return {
        action:"held",
        positionId:open.id,
        reason:squeezeWarning
          ? squeezeProtection.reason
          : "Adaptive position 청산 조건 미충족",
      };
    }

    const {data,error}=await supabase.rpc("adaptive_paper_close_position_v1",{
      p_position_id:open.id,p_market_price:marketPrice,p_close_reason:closeReason,
      p_fee_rate_percent:FEE_RATE_PERCENT,
    });
    if(error) throw new Error(`[Adaptive Paper] close RPC 실패: ${error.message}`);
    const result=(data??{}) as any;
    if(result.status==="closed" && result.trade_id){
      const {error:tradeMetaError}=await supabase.from("adaptive_paper_trades").update({
        requested_leverage:open.requested_leverage,
        estimated_liquidation_price:open.estimated_liquidation_price,
        liquidation_distance_percent:open.liquidation_distance_percent,
        liquidation_safety_buffer_percent:open.liquidation_safety_buffer_percent,
        liquidation_safety_status:open.liquidation_safety_status,
        maintenance_margin_rate_percent:open.maintenance_margin_rate_percent,
        leverage_adjusted:open.leverage_adjusted ?? false,
        squeeze_warning_snapshot_id:squeezeWarning?.snapshotId??null,
        squeeze_exit_phase:squeezeProtection.relevantPhase,
        squeeze_exit_alert_score:squeezeProtection.relevantAlertScore,
        squeeze_protection_action:closeReason==="squeeze_active"?"close":"none",
        squeeze_strategy_version:"adaptive-paper-squeeze-v7.17",
      }).eq("id",num(result.trade_id));
      if(tradeMetaError) throw new Error(`[Adaptive Paper] trade liquidation metadata 저장 실패: ${tradeMetaError.message}`);
    }
    await saveEquitySnapshot(account,null,marketPrice);
    return {
      action:result.status==="closed"?"closed":"skipped",
      positionId:open.id,tradeId:result.trade_id,
      reason:result.status==="closed"
        ? `${closeReason} · net ${round(num(result.net_pnl),4)} USDT`
        : String(result.reason??"close skipped"),
    };
  }

  if(!v2) return {action:"skipped",reason:"V2 판단이 없습니다."};
  const triggerStatus=String(v2.entry_trigger?.status??"UNAVAILABLE");
  if(triggerStatus!=="READY"){
    await saveEquitySnapshot(account,null,marketPrice);
    return {action:"skipped",reason:`Entry Trigger ${triggerStatus} — READY 대기`};
  }
  if(v2.direction!=="bullish" && v2.direction!=="bearish"){
    return {action:"skipped",reason:`V2 direction=${v2.direction}`};
  }

  if(v2.trading_permission==="blocked" || v2.squeeze_permission_override==="blocked"){
    return {action:"skipped",reason:"Decision V2 squeeze/risk permission blocked"};
  }

  const entrySide=v2.direction==="bullish"?"long":"short";

  // Phase 8-6: 8-5 Context Activation을 실제 Adaptive Paper 신규 진입에 연결.
  // 기존 포지션 청산/보호 로직은 건드리지 않고 신규 진입만 보수적으로 제한합니다.
  const contextExecutionGuard=await runPhase86ContextExecutionGuard(entrySide);
  if(!contextExecutionGuard.sideAllowed){
    await saveEquitySnapshot(account,null,marketPrice);
    return {action:"skipped",reason:`Context Execution Guard BLOCKED · ${contextExecutionGuard.reasons.join(" / ")}`};
  }

  const squeezeEntryGuard=evaluateAdaptiveSqueezeEntryGuard({
    side:entrySide,
    warning:squeezeWarning,
  });
  if(!squeezeEntryGuard.allowed){
    await saveEquitySnapshot(account,null,marketPrice);
    return {action:"skipped",reason:squeezeEntryGuard.reason};
  }

  const sizing=await getSizing(v2.id);
  if(!sizing || sizing.sizing_status!=="candidate_ready" || num(sizing.margin_percent)<=0 || num(sizing.leverage)<=0){
    return {action:"skipped",reason:"READY 판단에 사용할 candidate sizing이 없습니다."};
  }

  const referencePlan=v2.entry_trigger?.referencePlan ?? v2.entry_plan ?? null;
  const invalidationPrice=num(referencePlan?.invalidationPrice);
  if(invalidationPrice<=0) return {action:"skipped",reason:"고정 invalidation price가 없습니다."};

  // 실제 Adaptive 계정의 현재 cash를 기준으로 margin 금액을 다시 계산합니다.
  const freshAccount=await supabase.from("adaptive_paper_accounts")
    .select("cash_balance").eq("id",account.id).single();
  if(freshAccount.error) throw new Error(`[Adaptive Paper] cash refresh 실패: ${freshAccount.error.message}`);
  const equityForSizing=num(freshAccount.data.cash_balance);

  const plan=buildAdaptiveExecutionPlan({
    side:entrySide,
    marketPrice,invalidationPrice,
    marginPercent:num(sizing.margin_percent)*squeezeEntryGuard.marginMultiplier*contextExecutionGuard.marginMultiplier,
    leverage:Math.trunc(num(sizing.leverage)),
    accountEquity:equityForSizing,
    feeRatePercent:FEE_RATE_PERCENT,targetRiskReward:TARGET_RR,
    maintenanceMarginRatePercent:MAINTENANCE_MARGIN_RATE_PERCENT,
    liquidationSafetyBufferPercent:LIQUIDATION_SAFETY_BUFFER_PERCENT,
  });

  const {data,error}=await supabase.rpc("adaptive_paper_open_position_v1",{
    p_account_id:account.id,p_base_config_id:config.id,p_symbol:"BTCUSDT",
    p_side:plan.side,p_decision_v2_id:v2.id,p_sizing_snapshot_id:sizing.id,
    p_entry_price:plan.entryPrice,p_stop_loss_price:plan.stopLossPrice,
    p_take_profit_price:plan.takeProfitPrice,p_margin_percent:plan.marginPercent,
    p_leverage:plan.leverage,p_margin_amount:plan.marginAmount,
    p_notional_amount:plan.notionalAmount,p_quantity:plan.quantity,
    p_entry_fee:plan.entryFee,p_risk_reward_ratio:plan.riskRewardRatio,
    p_expected_stop_loss_amount:plan.expectedStopLossAmount,
  });
  if(error) throw new Error(`[Adaptive Paper] open RPC 실패: ${error.message}`);

  const result=(data??{}) as any;
  if(result.status!=="opened"){
    return {action:"skipped",reason:String(result.reason??"adaptive open skipped"),plan};
  }

  const {error:liqMetaError}=await supabase.from("adaptive_paper_positions").update({
    requested_leverage:plan.requestedLeverage,
    estimated_liquidation_price:plan.estimatedLiquidationPrice,
    liquidation_distance_percent:plan.liquidationDistancePercent,
    liquidation_safety_buffer_percent:plan.liquidationSafetyBufferPercent,
    liquidation_safety_status:plan.liquidationSafetyStatus,
    maintenance_margin_rate_percent:plan.maintenanceMarginRatePercent,
    leverage_adjusted:plan.leverageAdjusted,
    liquidation_safety_reasons:plan.liquidationSafetyReasons,
    squeeze_warning_snapshot_id:squeezeWarning?.snapshotId??null,
    squeeze_phase:entrySide==="long"?(squeezeWarning?.longPhase??"WATCH"):(squeezeWarning?.shortPhase??"WATCH"),
    squeeze_alert_score:entrySide==="long"?(squeezeWarning?.longAlertScore??0):(squeezeWarning?.shortAlertScore??0),
    squeeze_protection_action:squeezeEntryGuard.marginMultiplier<1?"reduced_entry":"none",
    squeeze_protection_updated_at:new Date().toISOString(),
  }).eq("id",num(result.position_id));
  if(liqMetaError) throw new Error(`[Adaptive Paper] liquidation metadata 저장 실패: ${liqMetaError.message}`);

  await supabase.from("adaptive_position_sizing_snapshots")
    .update({apply_mode:"paper_apply"}).eq("id",sizing.id);

  const created=await getOpenPosition(account.id);
  await saveEquitySnapshot(account,created,marketPrice);

  return {
    action:plan.side==="long"?"opened_long":"opened_short",
    positionId:num(result.position_id),plan,
    reason:`READY → ${plan.side.toUpperCase()} · margin ${plan.marginPercent}% · ${plan.leverage}x` +
      `${squeezeEntryGuard.marginMultiplier<1 ? ` · squeeze margin x${squeezeEntryGuard.marginMultiplier}` : ""}` +
      `${contextExecutionGuard.marginMultiplier<1 ? ` · context margin x${contextExecutionGuard.marginMultiplier}` : ""}` +
      `${plan.leverageAdjusted ? ` (요청 ${plan.requestedLeverage}x에서 안전조정)` : ""}` +
      ` · liq ${round(plan.estimatedLiquidationPrice,2)} · notional ${round(plan.notionalAmount,2)} USDT`,
  };
}
