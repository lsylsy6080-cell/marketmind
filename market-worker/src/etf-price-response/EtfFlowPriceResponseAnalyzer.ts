import type {
  EtfFlowDirection,
  EtfFlowPriceResponseInput,
  EtfFlowPriceResponseResult,
  PriceDirection,
  PriceReaction,
} from "./types";

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export function classifyFlowDirection(flowUsd:number):EtfFlowDirection{
  if(flowUsd>=25_000_000)return "inflow";
  if(flowUsd<=-25_000_000)return "outflow";
  return "flat";
}

export function classifyFlowStrength(flowUsd:number){
  const absolute=Math.abs(flowUsd);
  if(absolute>=750_000_000)return "extreme" as const;
  if(absolute>=300_000_000)return "high" as const;
  if(absolute>=100_000_000)return "medium" as const;
  return "low" as const;
}

export function calculateReturnPercent(anchorPriceUsd:number,priceUsd:number):number{
  if(anchorPriceUsd<=0||!Number.isFinite(anchorPriceUsd)||!Number.isFinite(priceUsd)){
    throw new Error("ETF 가격반응 계산에 유효한 가격이 필요합니다.");
  }
  return Math.round(((priceUsd/anchorPriceUsd)-1)*100*10_000)/10_000;
}

export function classifyPriceDirection(returnPercent:number|null):PriceDirection{
  if(returnPercent===null)return "unavailable";
  if(returnPercent>=0.35)return "up";
  if(returnPercent<=-0.35)return "down";
  return "flat";
}

export function buildReaction(
  horizonHours:6|12|24|48,
  anchorPriceUsd:number,
  priceUsd:number|null,
):PriceReaction{
  if(priceUsd===null){
    return {horizonHours,priceUsd:null,returnPercent:null,direction:"unavailable"};
  }
  const returnPercent=calculateReturnPercent(anchorPriceUsd,priceUsd);
  return {
    horizonHours,
    priceUsd,
    returnPercent,
    direction:classifyPriceDirection(returnPercent),
  };
}

const WEIGHTS:Record<number,number>={6:0.15,12:0.20,24:0.35,48:0.30};

function responseEvidence(reactions:PriceReaction[]){
  let bullish=0,bearish=0,totalWeight=0;
  for(const reaction of reactions){
    if(reaction.returnPercent===null)continue;
    const weight=WEIGHTS[reaction.horizonHours]??0;
    totalWeight+=weight;
    const normalized=clamp(reaction.returnPercent/3,-1,1);
    if(normalized>0)bullish+=normalized*weight;
    if(normalized<0)bearish+=Math.abs(normalized)*weight;
  }
  if(totalWeight<=0)return {bullish:0,bearish:0,net:0,coverage:0};
  return {
    bullish:bullish/totalWeight,
    bearish:bearish/totalWeight,
    net:(bullish-bearish)/totalWeight,
    coverage:totalWeight,
  };
}

function determineState(
  flowDirection:EtfFlowDirection,
  netResponse:number,
  availableCount:number,
){
  if(availableCount===0)return "collecting" as const;
  if(flowDirection==="flat")return "flow_neutral" as const;

  if(flowDirection==="inflow"){
    if(netResponse>=0.12)return "confirmed_inflow" as const;
    if(netResponse<=-0.12)return "inflow_selling_pressure" as const;
    return "inflow_absorption" as const;
  }

  if(netResponse<=-0.12)return "confirmed_outflow" as const;
  if(netResponse>=0.12)return "outflow_absorbed" as const;
  return "outflow_absorption" as const;
}

function createSummary(
  state:EtfFlowPriceResponseResult["state"],
  flowUsd:number,
  reactions:PriceReaction[],
){
  const flowText=flowUsd>=0
    ? `ETF 순유입 ${(Math.abs(flowUsd)/1_000_000).toFixed(1)}M달러`
    : `ETF 순유출 ${(Math.abs(flowUsd)/1_000_000).toFixed(1)}M달러`;
  const r24=reactions.find((r)=>r.horizonHours===24)?.returnPercent;
  const responseText=r24===null||r24===undefined
    ?"24시간 가격반응 수집 중"
    : `24시간 BTC 반응 ${r24>=0?"+":""}${r24.toFixed(2)}%`;

  const message:Record<typeof state,string>={
    confirmed_inflow:"자금 유입과 가격 상승이 함께 확인돼 기관수급이 가격에 반영되고 있습니다.",
    inflow_selling_pressure:"ETF 자금이 들어왔지만 BTC가 하락해 더 강한 매도 압력이 유입 물량을 흡수하고 있습니다.",
    inflow_absorption:"ETF 순유입에도 가격 반응이 약해 매물 소화 여부를 추가 관찰해야 합니다.",
    confirmed_outflow:"ETF 순유출과 BTC 하락이 함께 나타나 기관 자금 이탈이 가격에 반영되고 있습니다.",
    outflow_absorbed:"ETF 자금이 빠졌는데도 BTC가 상승해 시장의 매수 흡수력이 강합니다.",
    outflow_absorption:"ETF 순유출에도 가격이 버티고 있어 매도 물량이 흡수되는지 관찰해야 합니다.",
    flow_neutral:"ETF 흐름 규모가 작아 가격 반응을 독립적인 기관수급 신호로 보기 어렵습니다.",
    collecting:"가격 반응 표본을 수집 중입니다.",
  };

  return `${flowText} · ${responseText}. ${message[state]}`;
}

export function analyzeEtfFlowPriceResponse(
  input:EtfFlowPriceResponseInput,
):EtfFlowPriceResponseResult{
  if(!Number.isFinite(input.flowUsd))throw new Error("ETF flowUsd가 유효하지 않습니다.");
  if(!Number.isFinite(input.anchorPriceUsd)||input.anchorPriceUsd<=0){
    throw new Error("ETF 기준 BTC 가격이 유효하지 않습니다.");
  }

  const flowDirection=classifyFlowDirection(input.flowUsd);
  const flowStrength=classifyFlowStrength(input.flowUsd);
  const available=input.reactions.filter((r)=>r.returnPercent!==null);
  const evidence=responseEvidence(input.reactions);
  const state=determineState(flowDirection,evidence.net,available.length);

  // 핵심: flow 자체보다 실제 가격반응을 더 크게 반영한다.
  // 순유입인데 가격이 떨어지면 점수가 낮아지고,
  // 순유출인데 가격이 오르면 점수가 높아진다.
  const flowBias=
    flowDirection==="inflow"?6:
    flowDirection==="outflow"?-6:0;
  const responseBias=evidence.net*38;
  const score=Math.round(clamp(50+flowBias+responseBias,0,100));

  const dataCoverage=available.length/4;
  const flowMagnitudeConfidence=
    flowStrength==="extreme"?18:
    flowStrength==="high"?15:
    flowStrength==="medium"?10:5;
  const confidence=Math.round(clamp(45+dataCoverage*30+flowMagnitudeConfidence,45,95));

  return {
    asset:input.asset,
    flowDate:input.flowDate,
    observedAt:input.observedAt,
    flowUsd:input.flowUsd,
    flowDirection,
    flowStrength,
    anchorPriceUsd:input.anchorPriceUsd,
    reactions:input.reactions,
    state,
    score,
    confidence,
    bullishEvidence:Math.round(evidence.bullish*1000)/10,
    bearishEvidence:Math.round(evidence.bearish*1000)/10,
    summary:createSummary(state,input.flowUsd,input.reactions),
    strategyVersion:"btc-etf-price-response-v1",
  };
}
