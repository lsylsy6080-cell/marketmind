"use client";

import { useMemo, useState } from "react";
import type { NewsDirection, NewsPageData } from "../news-data";
import { formatRelativeTime } from "../format";

const ko:Record<NewsDirection,string>={bullish:"긍정",neutral:"중립",bearish:"부정"};
const signed=(score:number)=>{const x=(score-50)/50;return`${x>=0?"+":""}${x.toFixed(2)}`};
const tone=(d:NewsDirection)=>d==="bullish"?"positive":d==="bearish"?"negative":"neutral";

export function NewsMockupDashboard({data}:{data:NewsPageData}){
 const [filter,setFilter]=useState<"all"|NewsDirection>("all");
 const score=data.score;
 const articles=useMemo(()=>filter==="all"?data.articles:data.articles.filter(a=>a.sentiment===filter),[data.articles,filter]);
 const translated=data.articles.length?Math.round(data.articles.filter(a=>a.translationStatus==="completed").length/data.articles.length*100):0;
 const category=score?.dominantCategory?.replaceAll("_"," ")??"분류 대기";
 const marketImpact=score?Math.min(10,Math.max(0,Math.abs(score.weightedScore-50)/5)):0;
 const bullPct=(score?.bullishCount??0)/Math.max(1,score?.uniqueArticleCount??1)*100;
 const neutralEndPct=((score?.bullishCount??0)+(score?.neutralCount??0))/Math.max(1,score?.uniqueArticleCount??1)*100;
 const top=articles.slice(0,8); const headlines=[...data.articles].sort((a,b)=>(b.importance*Math.abs(b.score-50))-(a.importance*Math.abs(a.score-50))).slice(0,4);
 return <section className="mock-page mock-news">
  {data.error?<div className="notice notice-error"><strong>뉴스 데이터를 불러오지 못했습니다.</strong><span>{data.error}</span></div>:null}
  <div className="mock-news-filters">{([['all','전체'],['bullish','긍정'],['neutral','중립'],['bearish','부정']] as const).map(([k,l])=><button key={k} className={filter===k?"active":""} onClick={()=>setFilter(k)}>{l}</button>)}</div>
  <div className="mock-kpi-grid mock-kpi-six">
   <article><span>뉴스 점수 ⓘ</span><strong className={`tone-${tone(score?.direction??"neutral")}`}>{score?signed(score.weightedScore):"—"}</strong><small>{score?ko[score.direction]:"분석 대기"}</small></article>
   <article><span>시장 영향 ⓘ</span><strong className="mock-warning">{score?`중간 (${marketImpact.toFixed(1)}/10)`:"—"}</strong><small>최근 뉴스 변동성 영향</small></article>
   <article><span>주요 카테고리 ⓘ</span><strong>{category}</strong><small>지배 이슈</small></article>
   <article><span>중복 제거 ⓘ</span><strong className="paper-positive">{score?`${Math.max(0,100-Math.round((score.uniqueArticleCount/Math.max(1,score.articleCount))*100))}%`:"—"}</strong><small>중복 뉴스 제거율</small></article>
   <article><span>한글 편집 ⓘ</span><strong className="mock-blue">{translated}%</strong><small>한글 전문 적용률</small></article>
   <article><span>최신 업데이트 ⓘ</span><strong className="mock-blue">{score?new Date(score.calculatedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}):"—"}</strong><small>{score?new Date(score.calculatedAt).toLocaleDateString("ko-KR"):"대기"}</small></article>
  </div>

  <div className="mock-news-main">
   <article className="mock-panel mock-news-feed"><header><h2>최신 뉴스</h2><span>최신순⌄</span></header>{top.length?top.map(a=><a href={a.articleUrl} target="_blank" rel="noreferrer" key={a.id}><div className="news-source-badge">{a.source.slice(0,2).toUpperCase()}</div><span><b>{a.title}</b><small>{a.summary??"MarketMind가 시장 영향을 분석한 뉴스입니다."}</small><em>{a.source} · {formatRelativeTime(a.publishedAt)}</em></span><strong className={`tone-${tone(a.sentiment)}`}>{ko[a.sentiment]}<small>영향 {Math.abs(a.score-50).toFixed(1)}/10</small></strong></a>):<p className="mock-empty">뉴스 수집 중입니다.</p>}<footer>더 많은 뉴스 보기⌄</footer></article>
   <div className="mock-news-side">
    <article className="mock-panel mock-news-intel"><h2>뉴스 인텔리전스</h2><div className="news-intel-grid"><span><small>지배 카테고리</small><b className="mock-blue">{category}</b><em>{score?.articleCount??0}건</em></span><span><small>종합 점수</small><b>{score?`${marketImpact.toFixed(1)}/10`:"—"}</b><em>시장 영향</em></span><span><small>시장 압력</small><b className={`tone-${tone(score?.direction??"neutral")}`}>{score?.direction==="bullish"?"↑ 강세":score?.direction==="bearish"?"↓ 약세":"→ 중립"}</b><em>뉴스 흐름</em></span><span><small>정보 신뢰도</small><b className="paper-positive">{score?`${score.confidence.toFixed(0)}%`:"—"}</b><em>평균 신뢰도</em></span></div><h3>핵심 속보 <i>● LIVE</i></h3>{headlines.map((a,i)=><div className="headline" key={a.id}><b>{i+1}</b><span>{a.title}<small>{a.source}</small></span><time>{formatRelativeTime(a.publishedAt)}</time></div>)}</article>
    <article className="mock-panel mock-news-ai"><h2>AI 요약 ⓘ</h2><p>{score?`현재 뉴스 흐름은 ${ko[score.direction]} 방향이며, ${category} 관련 이슈가 가장 높은 비중을 차지하고 있습니다. 총 ${score.uniqueArticleCount}개의 유효 뉴스가 분석에 반영되었습니다.`:"뉴스 분석 결과를 기다리고 있습니다."}</p><div><span className="paper-positive">긍정 요인: {score?.bullishCount??0}건</span><span className="paper-negative">주의 요인: {score?.bearishCount??0}건</span></div><label>AI 신뢰도 <i><b style={{width:`${score?.confidence??0}%`}}/></i><strong>{score?`${score.confidence.toFixed(0)}%`:"—"}</strong></label></article>
   </div>
  </div>

  <div className="mock-news-bottom"><article className="mock-panel"><h2>24시간 뉴스 흐름 ⓘ</h2><div className="fake-line-chart">{data.articles.slice(0,18).reverse().map((a,i)=><i key={a.id} style={{height:`${20+Math.min(75,a.importance*5+Math.abs(a.score-50))}%`}} title={a.title}/>)}</div></article><article className="mock-panel"><h2>감성 비중 ⓘ</h2><div className="mock-donut" style={{background:`conic-gradient(#2563eb 0 ${bullPct}%, #f59e0b ${bullPct}% ${neutralEndPct}%, #ef5350 ${neutralEndPct}% 100%)`}}><span><b>{score?.uniqueArticleCount??"—"}</b><small>뉴스</small></span></div></article></div>
 </section>
}
