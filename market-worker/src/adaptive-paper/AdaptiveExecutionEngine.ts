import type {
  AdaptiveExecutionPlan,
  AdaptivePaperSide,
  LiquidationSafetyResult,
} from "./types";

const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
const round=(v:number,d=8)=>{const m=10**d;return Math.round(v*m)/m};

export function estimateLiquidationPrice(input:{
  side:AdaptivePaperSide;
  entryPrice:number;
  leverage:number;
  maintenanceMarginRatePercent?:number;
}):number{
  const mmr=(input.maintenanceMarginRatePercent ?? 0.5)/100;
  if(input.leverage<=1){
    return input.side==="long" ? 0 : input.entryPrice*2;
  }

  // Isolated USDT-M의 개념적 안전 추정치.
  // 실제 거래소 tier/maintenance amount에 따라 달라질 수 있으므로
  // 실거래 청산가가 아니라 보수적 Paper Risk Guard 용도로만 사용합니다.
  const initialMarginRate=1/input.leverage;
  const price=input.side==="long"
    ? input.entryPrice*(1-initialMarginRate+mmr)
    : input.entryPrice*(1+initialMarginRate-mmr);

  return round(Math.max(0,price),8);
}

export function evaluateLiquidationSafety(input:{
  side:AdaptivePaperSide;
  entryPrice:number;
  stopLossPrice:number;
  requestedLeverage:number;
  maintenanceMarginRatePercent?:number;
  safetyBufferPercent?:number;
  minLeverage?:number;
}):LiquidationSafetyResult{
  const maintenanceMarginRatePercent=input.maintenanceMarginRatePercent ?? 0.5;
  const safetyBufferPercent=input.safetyBufferPercent ?? 1.0;
  const minLeverage=Math.max(1,Math.trunc(input.minLeverage ?? 1));
  const requested=Math.max(minLeverage,Math.trunc(input.requestedLeverage));

  if(input.entryPrice<=0 || input.stopLossPrice<=0) throw new Error("entry/stop price must be > 0");
  if(input.side==="long" && input.stopLossPrice>=input.entryPrice) throw new Error("LONG stop must be below entry");
  if(input.side==="short" && input.stopLossPrice<=input.entryPrice) throw new Error("SHORT stop must be above entry");

  const stopDistancePercent=Math.abs(input.entryPrice-input.stopLossPrice)/input.entryPrice*100;
  const minimumRequiredDistancePercent=stopDistancePercent+safetyBufferPercent;
  const reasons:string[]=[];

  for(let leverage=requested; leverage>=minLeverage; leverage-=1){
    const liquidationPrice=estimateLiquidationPrice({
      side:input.side,
      entryPrice:input.entryPrice,
      leverage,
      maintenanceMarginRatePercent,
    });

    const liquidationDistancePercent=input.side==="long"
      ? (input.entryPrice-liquidationPrice)/input.entryPrice*100
      : (liquidationPrice-input.entryPrice)/input.entryPrice*100;

    const priceOrderSafe=input.side==="long"
      ? liquidationPrice < input.stopLossPrice
      : liquidationPrice > input.stopLossPrice;

    const distanceSafe=liquidationDistancePercent>=minimumRequiredDistancePercent;

    if(priceOrderSafe && distanceSafe){
      const adjusted=leverage!==requested;
      if(adjusted){
        reasons.push(
          `요청 ${requested}x는 손절-청산 안전거리 부족으로 ${leverage}x까지 자동 하향했습니다.`,
        );
      }else{
        reasons.push(`요청 ${requested}x가 청산 안전거리 조건을 충족합니다.`);
      }
      reasons.push(
        `손절거리 ${round(stopDistancePercent,3)}% + 버퍼 ${round(safetyBufferPercent,3)}% ≤ 청산거리 ${round(liquidationDistancePercent,3)}%.`,
      );
      return {
        requestedLeverage:requested,
        appliedLeverage:leverage,
        adjusted,
        estimatedLiquidationPrice:round(liquidationPrice,8),
        liquidationDistancePercent:round(liquidationDistancePercent,4),
        stopDistancePercent:round(stopDistancePercent,4),
        safetyBufferPercent:round(safetyBufferPercent,4),
        minimumRequiredDistancePercent:round(minimumRequiredDistancePercent,4),
        maintenanceMarginRatePercent:round(maintenanceMarginRatePercent,4),
        status:adjusted?"adjusted":"safe",
        reasons,
      };
    }
  }

  return {
    requestedLeverage:requested,
    appliedLeverage:0,
    adjusted:true,
    estimatedLiquidationPrice:0,
    liquidationDistancePercent:0,
    stopDistancePercent:round(stopDistancePercent,4),
    safetyBufferPercent:round(safetyBufferPercent,4),
    minimumRequiredDistancePercent:round(minimumRequiredDistancePercent,4),
    maintenanceMarginRatePercent:round(maintenanceMarginRatePercent,4),
    status:"blocked",
    reasons:[
      `최소 ${minLeverage}x까지 낮춰도 손절가보다 충분히 먼 청산 안전거리를 확보하지 못했습니다.`,
    ],
  };
}

export function buildAdaptiveExecutionPlan(input:{
  side:AdaptivePaperSide;
  marketPrice:number;
  invalidationPrice:number;
  marginPercent:number;
  leverage:number;
  accountEquity:number;
  feeRatePercent?:number;
  targetRiskReward?:number;
  maintenanceMarginRatePercent?:number;
  liquidationSafetyBufferPercent?:number;
}):AdaptiveExecutionPlan{
  const feeRatePercent=input.feeRatePercent ?? 0.04;
  const targetRiskReward=clamp(input.targetRiskReward ?? 1.5,1,3);

  if(!Number.isFinite(input.marketPrice)||input.marketPrice<=0) throw new Error("marketPrice must be > 0");
  if(!Number.isFinite(input.accountEquity)||input.accountEquity<=0) throw new Error("accountEquity must be > 0");
  if(!Number.isFinite(input.marginPercent)||input.marginPercent<=0||input.marginPercent>100) throw new Error("marginPercent out of range");
  if(!Number.isInteger(input.leverage)||input.leverage<1||input.leverage>20) throw new Error("leverage out of range");
  if(!Number.isFinite(input.invalidationPrice)||input.invalidationPrice<=0) throw new Error("invalidationPrice must be > 0");

  if(input.side==="long" && input.invalidationPrice>=input.marketPrice){
    throw new Error("LONG invalidation must be below market price");
  }
  if(input.side==="short" && input.invalidationPrice<=input.marketPrice){
    throw new Error("SHORT invalidation must be above market price");
  }

  const stopDistancePercent=Math.abs(input.marketPrice-input.invalidationPrice)/input.marketPrice*100;
  if(stopDistancePercent<0.05 || stopDistancePercent>15) throw new Error("stop distance is outside safety range");

  const liquidationSafety=evaluateLiquidationSafety({
    side:input.side,
    entryPrice:input.marketPrice,
    stopLossPrice:input.invalidationPrice,
    requestedLeverage:input.leverage,
    maintenanceMarginRatePercent:input.maintenanceMarginRatePercent,
    safetyBufferPercent:input.liquidationSafetyBufferPercent,
    minLeverage:1,
  });

  if(liquidationSafety.status==="blocked" || liquidationSafety.appliedLeverage<1){
    throw new Error(`liquidation safety blocked: ${liquidationSafety.reasons.join(" ")}`);
  }

  const appliedLeverage=liquidationSafety.appliedLeverage;
  const marginAmount=input.accountEquity*(input.marginPercent/100);
  const notionalAmount=marginAmount*appliedLeverage;
  const quantity=notionalAmount/input.marketPrice;
  const targetDistancePercent=stopDistancePercent*targetRiskReward;
  const takeProfitPrice=input.side==="long"
    ? input.marketPrice*(1+targetDistancePercent/100)
    : input.marketPrice*(1-targetDistancePercent/100);
  const entryFee=notionalAmount*(feeRatePercent/100);
  const expectedStopLossAmount=notionalAmount*(stopDistancePercent/100);

  return {
    side:input.side,
    entryPrice:round(input.marketPrice,8),
    stopLossPrice:round(input.invalidationPrice,8),
    takeProfitPrice:round(takeProfitPrice,8),
    marginPercent:round(input.marginPercent,4),
    requestedLeverage:input.leverage,
    leverage:appliedLeverage,
    leverageAdjusted:liquidationSafety.adjusted,
    marginAmount:round(marginAmount,8),
    notionalAmount:round(notionalAmount,8),
    quantity:round(quantity,12),
    stopDistancePercent:round(stopDistancePercent,4),
    targetDistancePercent:round(targetDistancePercent,4),
    riskRewardRatio:round(targetRiskReward,2),
    entryFee:round(entryFee,8),
    expectedStopLossAmount:round(expectedStopLossAmount,8),
    estimatedLiquidationPrice:liquidationSafety.estimatedLiquidationPrice,
    liquidationDistancePercent:liquidationSafety.liquidationDistancePercent,
    liquidationSafetyBufferPercent:liquidationSafety.safetyBufferPercent,
    liquidationSafetyStatus:liquidationSafety.status,
    maintenanceMarginRatePercent:liquidationSafety.maintenanceMarginRatePercent,
    liquidationSafetyReasons:liquidationSafety.reasons,
  };
}

export function determineAdaptiveCloseReason(input:{
  side:AdaptivePaperSide;
  marketPrice:number;
  entryPrice:number;
  stopLossPrice:number;
  takeProfitPrice:number;
  openedAt:string;
  maxHoldingMinutes:number;
  triggerStatus?:string|null;
  currentDirection?:string|null;
  nowMs?:number;
}):"stop_loss"|"take_profit"|"trigger_invalidated"|"opposite_direction"|"max_holding"|null{
  const now=input.nowMs ?? Date.now();

  if(input.side==="long"){
    if(input.marketPrice<=input.stopLossPrice) return "stop_loss";
    if(input.marketPrice>=input.takeProfitPrice) return "take_profit";
  }else{
    if(input.marketPrice>=input.stopLossPrice) return "stop_loss";
    if(input.marketPrice<=input.takeProfitPrice) return "take_profit";
  }

  if(input.triggerStatus==="INVALIDATED") return "trigger_invalidated";
  if(input.side==="long" && input.currentDirection==="bearish") return "opposite_direction";
  if(input.side==="short" && input.currentDirection==="bullish") return "opposite_direction";

  const openedMs=new Date(input.openedAt).getTime();
  if(Number.isFinite(openedMs) && now-openedMs>=input.maxHoldingMinutes*60_000) return "max_holding";
  return null;
}
