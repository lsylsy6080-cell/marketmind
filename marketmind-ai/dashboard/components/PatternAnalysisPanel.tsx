"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyzeChartPatterns,
  type PatternCandle,
  type PatternForecast,
} from "../pattern-analysis";

function money(value:number|null){
  if(value==null||!Number.isFinite(value))return "-";
  return `$${value.toLocaleString("en-US",{maximumFractionDigits:0})}`;
}

function statusLabel(value:"forming"|"completed"){
  return value==="completed"?"완성":"진행형";
}

function directionLabel(value:"bullish"|"bearish"|"neutral"){
  return value==="bullish"?"상승":value==="bearish"?"하락":"중립";
}

export function PatternAnalysisPanel(){
  const [candles,setCandles]=useState<PatternCandle[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    let disposed=false;

    async function load(){
      setLoading(true);
      setError(null);
      try{
        const response=await fetch(
          "/api/market-chart?symbol=BTCUSDT&interval=1h&limit=1000",
          {cache:"no-store"},
        );
        const payload=await response.json();
        if(!response.ok||!payload.ok)throw new Error(payload.error??"1시간봉 패턴 데이터를 불러오지 못했습니다.");
        if(disposed)return;
        setCandles((payload.candles??[]) as PatternCandle[]);
      }catch(e){
        if(!disposed)setError(e instanceof Error?e.message:"패턴 분석 데이터를 불러오지 못했습니다.");
      }finally{
        if(!disposed)setLoading(false);
      }
    }

    void load();
    const timer=setInterval(load,60_000);
    return()=>{
      disposed=true;
      clearInterval(timer);
    };
  },[]);

  const forecast:PatternForecast=useMemo(()=>analyzeChartPatterns(candles),[candles]);
  const primary=forecast.primary;

  return (
    <section className="panel pattern-analysis-panel">
      <div className="pattern-panel-head">
        <div>
          <span className="section-kicker">1시간봉 패턴 분석</span>
          <h2>차트 패턴 예측 · Drawing V2</h2>
        </div>
        <span className={`pattern-live ${loading?"loading":""}`}>{loading?"분석 중":"● LIVE"}</span>
      </div>

      {error?<div className="chart-error">{error}</div>:null}

      <div className="pattern-primary-card">
        <div className="pattern-primary-top">
          <div>
            <small>감지된 주요 패턴</small>
            <strong>{primary?.name??"뚜렷한 패턴 없음"}</strong>
          </div>
          {primary?(
            <span className={`pattern-status ${primary.direction}`}>
              {statusLabel(primary.status)}
            </span>
          ):null}
        </div>

        {primary?(
          <>
            <div className="pattern-confidence-row">
              <span>신뢰도</span>
              <strong>{primary.confidence}%</strong>
            </div>
            <div className="pattern-confidence-track"><i style={{width:`${primary.confidence}%`}} /></div>
            <dl className="pattern-detail-list">
              <div><dt>예상 방향</dt><dd className={primary.direction}>{directionLabel(primary.direction)}</dd></div>
              <div><dt>돌파 기준</dt><dd>{money(primary.breakoutPrice)}</dd></div>
              <div><dt>패턴 목표가</dt><dd>{money(primary.targetPrice)}</dd></div>
              <div><dt>24시간 목표</dt><dd>{money(forecast.expected24hTarget)}</dd></div>
            </dl>
            <p className="pattern-reason">{primary.reason}</p>
          </>
        ):(
          <p className="pattern-reason">최근 1시간봉에서 기준을 충족하는 주요 패턴이 아직 확인되지 않았습니다.</p>
        )}
      </div>

      <div className="pattern-probability">
        <div className="pattern-subhead">
          <strong>예측 확률 분포</strong>
          <small>1시간봉 · 향후 24시간</small>
        </div>
        <div className="pattern-probability-bar">
          <i className="bull" style={{width:`${forecast.bullishProbability}%`}} />
          <i className="neutral" style={{width:`${forecast.neutralProbability}%`}} />
          <i className="bear" style={{width:`${forecast.bearishProbability}%`}} />
        </div>
        <div className="pattern-probability-grid">
          <div><span className="dot bull"/><small>상승</small><strong>{forecast.bullishProbability}%</strong></div>
          <div><span className="dot neutral"/><small>횡보</small><strong>{forecast.neutralProbability}%</strong></div>
          <div><span className="dot bear"/><small>하락</small><strong>{forecast.bearishProbability}%</strong></div>
        </div>
      </div>

      <div className="pattern-market-evidence">
        <div className="pattern-subhead"><strong>분석 근거</strong><small>1시간봉</small></div>
        <dl className="pattern-evidence-list">
          <div><dt>EMA 정렬</dt><dd className={forecast.trend}>{forecast.trend==="bullish"?"상승 정렬":forecast.trend==="bearish"?"하락 정렬":"혼조"}</dd></div>
          <div><dt>RSI (14)</dt><dd>{forecast.rsi14?.toFixed(1)??"-"}</dd></div>
          <div><dt>EMA 20</dt><dd>{money(forecast.ema20)}</dd></div>
          <div><dt>EMA 60</dt><dd>{money(forecast.ema60)}</dd></div>
          <div><dt>종합 신뢰도</dt><dd>{forecast.confidence}%</dd></div>
        </dl>
      </div>

      <div className="pattern-history-list">
        <div className="pattern-subhead"><strong>감지 패턴 후보</strong><small>상위 5개</small></div>
        {forecast.patterns.slice(0,5).map((pattern)=>(
          <article key={pattern.id}>
            <div>
              <strong>{pattern.name}</strong>
              <small>{statusLabel(pattern.status)} · {directionLabel(pattern.direction)}</small>
            </div>
            <span className={pattern.direction}>{pattern.confidence}%</span>
          </article>
        ))}
        {!forecast.patterns.length?<p className="pattern-empty">현재 기준을 충족한 후보가 없습니다.</p>:null}
      </div>

      <div className="pattern-disclaimer">
        패턴 예측은 1시간봉의 과거 가격 구조와 기술적 조건을 이용한 확률 분석이며 실제 가격을 보장하지 않습니다.
      </div>
    </section>
  );
}
