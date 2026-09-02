import type { Phase83ContextInput, Phase83MarketContextResult, ContextPermission, ContextDirection, StructureState } from "./types";

const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const round=(v:number,d=2)=>Number(v.toFixed(d));

function room(distance:number|null):number|null {
  return distance===null||!Number.isFinite(distance)?null:Math.abs(distance);
}

export function buildMarketContext(input:Phase83ContextInput, now=new Date()):Omit<Phase83MarketContextResult,"performance"> {
  if(input.structure.symbol!=="BTCUSDT"||input.correlation.symbol!=="BTCUSDT") throw new Error("[8-3] BTCUSDT 소스만 지원합니다.");
  const s=input.structure.nearestSupport;
  const r=input.structure.nearestResistance;
  const downsideRoomPercent=room(s?.distancePercent??null);
  const upsideRoomPercent=room(r?.distancePercent??null);
  const supportStrength=s?.strength??null;
  const resistanceStrength=r?.strength??null;

  let structureState:StructureState="balanced";
  let structureScore=50;
  let preferredDirection:ContextDirection="neutral";

  if(upsideRoomPercent!==null&&downsideRoomPercent!==null){
    const tight=Math.min(upsideRoomPercent,downsideRoomPercent)<0.35;
    const bothTight=upsideRoomPercent<0.6&&downsideRoomPercent<0.6;
    const roomDelta=upsideRoomPercent-downsideRoomPercent;
    const strengthDelta=(supportStrength??50)-(resistanceStrength??50);
    const longEdge=roomDelta*18+strengthDelta*0.22;
    if(bothTight){structureState="compressed";structureScore=45;preferredDirection="neutral";}
    else if(longEdge>=8){structureState="long_room";structureScore=clamp(55+longEdge,0,90);preferredDirection="long";}
    else if(longEdge<=-8){structureState="short_room";structureScore=clamp(55+Math.abs(longEdge),0,90);preferredDirection="short";}
    else {structureState=tight?"compressed":"balanced";structureScore=tight?45:52;preferredDirection="neutral";}
  } else if(s&&!r){structureState="long_room";structureScore=62;preferredDirection="long";}
  else if(!s&&r){structureState="short_room";structureScore=62;preferredDirection="short";}

  const correlationRisk = clamp(
    input.correlation.overallDivergenceScore*0.75 +
    (input.correlation.state==="decoupled"?25:input.correlation.state==="diverging"?10:0) +
    (input.correlation.riskLevel==="high"?15:input.correlation.riskLevel==="normal"?5:0),0,100);
  const structuralRisk=structureState==="compressed"?30:structureState==="balanced"?15:Math.max(0,25-structureScore*0.2);
  const riskScore=clamp(correlationRisk*0.72+structuralRisk*0.28,0,100);
  const contextScore=clamp(structureScore*0.58+(100-riskScore)*0.42,0,100);

  let permission:ContextPermission="favorable";
  if(input.correlation.state==="decoupled"||input.correlation.riskLevel==="high"||riskScore>=70) permission="avoid";
  else if(structureState==="compressed"||preferredDirection==="neutral"||riskScore>=40) permission="caution";

  if(permission==="avoid") preferredDirection="neutral";
  const confidence=clamp(contextScore-(permission==="caution"?8:permission==="avoid"?20:0),0,100);

  const reasons:string[]=[];
  if(upsideRoomPercent!==null) reasons.push(`상방 여유 ${round(upsideRoomPercent)}%`);
  if(downsideRoomPercent!==null) reasons.push(`하방 여유 ${round(downsideRoomPercent)}%`);
  if(s?.grade)reasons.push(`하단 ${s.grade}급 지지 ${s.strength}/100 · ${(s.reasons??[]).slice(0,2).join(", ")}`);
  if(r?.grade)reasons.push(`상단 ${r.grade}급 저항 ${r.strength}/100 · ${(r.reasons??[]).slice(0,2).join(", ")}`);
  reasons.push(`구조 상태 ${structureState}`);
  reasons.push(`Spot/Futures ${input.correlation.state} · 괴리 ${round(input.correlation.overallDivergenceScore,1)}/100`);
  if(permission==="avoid") reasons.push("상관/괴리 위험이 높아 신규 진입 회피");
  else if(permission==="caution") reasons.push("구조 또는 상관 조건이 불완전해 보수적 관찰");
  else reasons.push(`${preferredDirection.toUpperCase()} 방향 구조 여유와 상관 안정성 확인`);

  return {
    symbol:"BTCUSDT",calculatedAt:now.toISOString(),preferredDirection,permission,
    confidence:round(confidence,1),contextScore:round(contextScore,1),riskScore:round(riskScore,1),structureState,
    upsideRoomPercent:upsideRoomPercent===null?null:round(upsideRoomPercent),downsideRoomPercent:downsideRoomPercent===null?null:round(downsideRoomPercent),
    supportStrength,resistanceStrength,correlationState:input.correlation.state,correlationRiskLevel:input.correlation.riskLevel,
    reasons,sourceCalculatedAt:{structure:input.structure.calculatedAt,correlation:input.correlation.calculatedAt},strategyVersion:"phase8-market-context-v8.3"
  };
}
