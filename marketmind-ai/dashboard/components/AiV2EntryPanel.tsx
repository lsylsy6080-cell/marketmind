"use client";

import { useEffect, useMemo, useState } from "react";
import type { AiDecisionV2Snapshot } from "../types";

const conditionLabels: Record<string, string> = {
  priceZoneReached: "관심 가격대 도달",
  entryScorePass: "Entry Score ≥ 62",
  overheatPass: "과열 ≤ 55",
  fifteenMinutePass: "15m 방향 안전",
  oneHourTrendPass: "1h 추세 지지",
  regimePass: "Regime 유지",
  newsSafe: "News 충돌 없음",
  fundingSafe: "Funding 안전",
  reliabilityPass: "데이터 신뢰도",
  permissionPass: "거래 권한",
};
function n(v:number|null|undefined,d=0){return v==null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
function statusText(v:string|undefined){return ({WATCH:"WATCH",RE_EVALUATE:"재평가",READY:"READY",INVALIDATED:"무효화",UNAVAILABLE:"대기"} as Record<string,string>)[v??""]??v??"—";}
function entryQualityText(score:number|null|undefined){
  const v=Number(score);
  if(!Number.isFinite(v)) return "판단 대기";
  if(v>=80) return "매우 좋음";
  if(v>=62) return "진입 가능";
  if(v>=45) return "관찰 필요";
  return "매우 낮음";
}
function heatText(score:number|null|undefined){
  const v=Number(score);
  if(!Number.isFinite(v)) return "판단 대기";
  if(v>=85) return "극심한 과열";
  if(v>55) return "과열";
  if(v>=35) return "보통";
  return "안정";
}
function actionText(action:string|null|undefined, preferred:string|null|undefined){
  if(String(action??"").toLowerCase()==="wait" && String(preferred??"").toLowerCase()==="pullback") return "눌림목 대기";
  if(String(action??"").toLowerCase()==="buy") return "매수 검토";
  if(String(action??"").toLowerCase()==="sell") return "매도 검토";
  return String(action??"대기").toUpperCase();
}


function useBinanceRealtimePrice() {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket("wss://fstream.binance.com/market/ws/btcusdt@markPrice@1s");
      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as { p?: string };
          const next = Number(payload.p);
          if (!disposed && Number.isFinite(next) && next > 0) setPrice(next);
        } catch {}
      };
      socket.onclose = () => {
        if (!disposed) retryTimer = setTimeout(connect, 2500);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return price;
}

function liveDistancePercent(current: number | null, target: number | null | undefined) {
  const c = Number(current);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || c <= 0 || t <= 0) return null;
  return ((t - c) / c) * 100;
}

function distanceLabel(value: number | null) {
  if (value === null) return "실시간 거리 계산 중";
  if (Math.abs(value) < 0.005) return "현재 가격대";
  return `실시간 ${value > 0 ? "+" : ""}${value.toFixed(3)}%`;
}

export function AiV2EntryPanel({ data }: { data: AiDecisionV2Snapshot | null }) {
  const realtimePrice = useBinanceRealtimePrice();
  if (!data) return <section className="panel mm-v2-entry"><div className="panel-title-row"><h2>AI V2 · Entry Plan</h2></div><p className="mm-v2-empty">V2 판단 데이터를 기다리고 있습니다.</p></section>;
  const plan=data.entry_plan, trigger=data.entry_trigger;
  const blockers=trigger?.blockers ?? [];
  const referencePlan=trigger?.referencePlan??plan;
  const firstLiveDistance=liveDistancePercent(realtimePrice,plan?.firstInterestPrice);
  const secondLiveDistance=liveDistancePercent(realtimePrice,plan?.secondInterestPrice);
  const invalidationLiveDistance=liveDistancePercent(realtimePrice,referencePlan?.invalidationPrice);
  return <section className="panel mm-v2-entry">
    <div className="panel-title-row"><h2>AI V2 · Entry Plan</h2><span className={`mm-trigger-badge s-${(trigger?.status??"UNAVAILABLE").toLowerCase()}`}>{statusText(trigger?.status)}</span></div>
    <div className="mm-v2-summary">
      <div className="mm-v2-direction"><span>AI 시장 판단</span><strong>{String(data.direction??"—").toUpperCase()} <em>{n(data.direction_strength,0)}%</em></strong><small>추세 강도 {n(data.market_trend_strength,1)} · 신뢰도 {n(data.final_confidence,1)}%</small></div>
      <div className="mm-v2-action"><span>현재 판단</span><strong>{actionText(data.action,data.preferred_entry)}</strong><small>관심 가격 도달 후 조건을 다시 검증합니다.</small></div>
      <div className="mm-v2-metric"><span>진입 품질</span><strong>{n(data.entry_quality_score,0)} <em>/ 100</em></strong><small>{entryQualityText(data.entry_quality_score)}</small></div>
      <div className={`mm-v2-metric heat-${Number(data.overheat_risk)>=85?"extreme":Number(data.overheat_risk)>55?"high":"normal"}`}><span>과열 위험</span><strong>{n(data.overheat_risk,0)} <em>/ 100</em></strong><small>{heatText(data.overheat_risk)} · 반전 위험 {n(data.reversal_risk,1)}</small></div>
    </div>
    {plan ? <div className="mm-entry-prices mm-entry-prices-targets">
      <div className="interest first"><span>1차 관심가 <b>WATCH</b></span><strong>${n(plan.firstInterestPrice,2)}</strong><small>{distanceLabel(firstLiveDistance)} · 예상 진입점수 {n(plan.firstInterestEstimatedScore,1)}</small></div>
      <div className="interest second"><span>2차 관심가 <b>RE-EVALUATE</b></span><strong>${n(plan.secondInterestPrice,2)}</strong><small>{distanceLabel(secondLiveDistance)} · 예상 진입점수 {n(plan.secondInterestEstimatedScore,1)}</small></div>
      <div className="invalid"><span>무효화 <b>FIXED PLAN</b></span><strong>${n(referencePlan?.invalidationPrice,2)}</strong><small>{distanceLabel(invalidationLiveDistance)} · 고정 기준 Plan</small></div>
    </div>:null}
    {trigger ? <>
      <div className="mm-trigger-progress"><div><strong>Trigger {statusText(trigger.status)}</strong><span>{trigger.passedConditions}/{trigger.totalConditions} 조건 충족</span></div><i><b style={{width:`${Math.min(100,(trigger.passedConditions/Math.max(1,trigger.totalConditions))*100)}%`}} /></i></div>
      <div className="mm-trigger-conditions">{Object.entries(trigger.conditions).map(([key,ok])=><span key={key} className={ok?"ok":"blocked"}><i>{ok?"✓":"×"}</i>{conditionLabels[key]??key}</span>)}</div>
      {blockers.length?<div className="mm-v2-blockers"><strong>남은 조건</strong>{blockers.map((x,i)=><span key={i}>• {x}</span>)}</div>:<div className="mm-v2-ready">진입 준비 조건을 모두 충족했습니다.</div>}
    </>:null}
  </section>;
}
