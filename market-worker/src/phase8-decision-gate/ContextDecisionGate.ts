import type { Phase84DecisionGateInput, Phase84DecisionGateResult, GateAlignment, GatePermission } from "./types";
import type { V2Action } from "../decision-v2/types";

const clamp = (v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const round = (v:number,d=1)=>Number(v.toFixed(d));

function decisionSide(direction:Phase84DecisionGateInput["decision"]["direction"]):"long"|"short"|"neutral"{
  return direction === "bullish" ? "long" : direction === "bearish" ? "short" : "neutral";
}

function shadowAction(base:V2Action, permission:GatePermission):V2Action {
  if (permission === "blocked") return "wait";
  if (permission === "caution") {
    if (base === "strong_buy") return "buy";
    if (base === "sell") return "reduce";
  }
  return base;
}

export function evaluateContextDecisionGate(
  input: Phase84DecisionGateInput,
  now = new Date(),
): Omit<Phase84DecisionGateResult,"performance"> {
  if (input.decision.symbol !== "BTCUSDT" || input.context.symbol !== "BTCUSDT") {
    throw new Error("[8-4] BTCUSDT 소스만 지원합니다.");
  }

  const side = decisionSide(input.decision.direction);
  let alignment:GateAlignment = "neutral";
  if (side !== "neutral" && input.context.preferredDirection !== "neutral") {
    alignment = side === input.context.preferredDirection ? "aligned" : "conflict";
  }

  let gatePermission:GatePermission = "pass";
  if (input.decision.tradingPermission === "blocked" || input.context.permission === "avoid") {
    gatePermission = "blocked";
  } else if (alignment === "conflict") {
    gatePermission = input.context.confidence >= 60 ? "blocked" : "caution";
  } else if (
    input.decision.tradingPermission === "caution" ||
    input.context.permission === "caution" ||
    side === "neutral"
  ) {
    gatePermission = "caution";
  }

  let delta = 0;
  if (gatePermission === "blocked") delta = -35;
  else if (alignment === "conflict") delta = -22;
  else if (gatePermission === "caution") delta = -10;
  else if (alignment === "aligned" && input.context.permission === "favorable") {
    delta = Math.min(6, Math.max(2, (input.context.confidence - 50) / 8));
  }

  const shadowEntryQualityScore = clamp(input.decision.entryQualityScore + delta);
  const confidence = clamp(
    input.decision.finalConfidence * 0.55 +
    input.context.confidence * 0.45 -
    (alignment === "conflict" ? 12 : 0) -
    (gatePermission === "blocked" ? 8 : 0),
  );

  const reasons:string[] = [];
  reasons.push(`V2 ${input.decision.direction}/${input.decision.action} · permission=${input.decision.tradingPermission}`);
  reasons.push(`Context ${input.context.preferredDirection}/${input.context.permission} · ${input.context.structureState}`);
  if (alignment === "aligned") reasons.push("V2 방향과 Market Context 방향이 일치");
  else if (alignment === "conflict") reasons.push("V2 방향과 Market Context 방향 충돌");
  else reasons.push("방향 비교가 중립 상태");
  if (input.context.permission === "avoid") reasons.push("Context avoid → 신규 진입 shadow 차단");
  else if (gatePermission === "caution") reasons.push("Context/Decision 조건 불완전 → shadow 보수화");
  else if (gatePermission === "pass") reasons.push("Context gate 통과");

  return {
    symbol:"BTCUSDT",
    calculatedAt:now.toISOString(),
    baseDirection:input.decision.direction,
    baseAction:input.decision.action,
    baseTradingPermission:input.decision.tradingPermission,
    contextDirection:input.context.preferredDirection,
    contextPermission:input.context.permission,
    alignment,
    gatePermission,
    shadowAction:shadowAction(input.decision.action,gatePermission),
    entryScoreDelta:round(delta),
    shadowEntryQualityScore:round(shadowEntryQualityScore),
    confidence:round(confidence),
    reasons,
    sourceCalculatedAt:{decision:input.decision.calculatedAt,context:input.context.calculatedAt},
    strategyVersion:"phase8-context-decision-gate-v8.4",
  };
}
