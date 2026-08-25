import { evaluateContextDecisionGate } from "./ContextDecisionGate";
import type { Phase84DecisionGateInput } from "./types";

function input(overrides?:Partial<Phase84DecisionGateInput>):Phase84DecisionGateInput {
  return {
    decision:{symbol:"BTCUSDT",calculatedAt:"2026-08-25T03:00:00.000Z",direction:"bullish",action:"buy",entryQualityScore:72,tradingPermission:"allowed",finalConfidence:78,riskLevel:"normal"},
    context:{symbol:"BTCUSDT",calculatedAt:"2026-08-25T03:00:05.000Z",preferredDirection:"long",permission:"favorable",confidence:80,contextScore:82,riskScore:18,structureState:"long_room"},
    ...overrides,
  };
}
function ok(name:string, cond:boolean){if(!cond)throw new Error(`[FAIL] ${name}`);console.log(`[PASS] ${name}`);}

{
  const r=evaluateContextDecisionGate(input());
  ok("V2 bullish + LONG favorable은 aligned/pass", r.alignment==="aligned"&&r.gatePermission==="pass"&&r.entryScoreDelta>0);
}
{
  const r=evaluateContextDecisionGate(input({context:{...input().context,preferredDirection:"short",confidence:82,structureState:"short_room"}}));
  ok("V2와 Context 방향 충돌 + 높은 신뢰도는 blocked", r.alignment==="conflict"&&r.gatePermission==="blocked"&&r.shadowAction==="wait");
}
{
  const r=evaluateContextDecisionGate(input({context:{...input().context,permission:"avoid",preferredDirection:"neutral",riskScore:88}}));
  ok("Context avoid는 기존 BUY를 shadow WAIT로 차단", r.gatePermission==="blocked"&&r.shadowAction==="wait"&&r.entryScoreDelta<0);
}
{
  const r=evaluateContextDecisionGate(input({decision:{...input().decision,action:"strong_buy"},context:{...input().context,permission:"caution"}}));
  ok("caution에서는 strong_buy를 shadow buy로 완화", r.gatePermission==="caution"&&r.shadowAction==="buy");
}
{
  const r=evaluateContextDecisionGate(input());
  ok("8-4는 원본 시각과 전략 버전을 보존", r.sourceCalculatedAt.decision===input().decision.calculatedAt&&r.strategyVersion==="phase8-context-decision-gate-v8.4");
}
