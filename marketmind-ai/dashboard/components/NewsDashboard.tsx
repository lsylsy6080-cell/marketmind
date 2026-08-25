"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NewsArticleView, NewsDirection, NewsPageData } from "../news-data";
import { formatRelativeTime } from "../format";

const directionLabel: Record<NewsDirection, string> = { bullish: "긍정", neutral: "중립", bearish: "부정" };
const directionText: Record<NewsDirection, string> = { bullish: "Bullish", neutral: "Neutral", bearish: "Bearish" };

function signedScore(score: number) {
  const centered = Math.round((score - 50) * 2);
  return `${centered > 0 ? "+" : ""}${centered}`;
}

function impactClass(score: number) {
  if (score >= 57) return "bullish";
  if (score <= 43) return "bearish";
  return "neutral";
}

function impactLabel(article: NewsArticleView) {
  const level = String(article.impactLevel ?? "").toLowerCase();
  if (level === "high") return "높음";
  if (level === "medium") return "보통";
  if (level === "low") return "낮음";
  return Math.abs(article.score - 50) >= 7 ? "높음" : Math.abs(article.score - 50) >= 3 ? "보통" : "낮음";
}

function NewsCard({ article }: { article: NewsArticleView }) {
  return (
    <a className={`news2-feature-card ${article.sentiment}`} href={article.articleUrl} target="_blank" rel="noreferrer">
      <div className="news2-cover">
        <span>{directionLabel[article.sentiment]}</span>
        <b>{article.source}</b>
      </div>
      <div className="news2-feature-body">
        <h3>{article.title}</h3>
        <p>{article.summary ?? "MarketMind가 이 뉴스의 시장 영향을 분석했습니다."}</p>
        <footer>
          <span>{article.source} · 영향도 {impactLabel(article)}</span>
          <time>{formatRelativeTime(article.publishedAt)}</time>
        </footer>
      </div>
    </a>
  );
}

export function NewsDashboard({ data }: { data: NewsPageData }) {
  const [filter, setFilter] = useState<"all" | NewsDirection>("all");
  const [articles, setArticles] = useState<NewsArticleView[]>(data.articles);
  const [hasMore, setHasMore] = useState(data.hasMore);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);
  const score = data.score;

  const featured = useMemo(
    () =>
      [...data.articles]
        .sort((a, b) => (b.importance * Math.abs(b.score - 50)) - (a.importance * Math.abs(a.score - 50)))
        .slice(0, 3),
    [data.articles],
  );

  const issueCount = score?.dominantCategory
    ? Math.max(1, Math.min(9, Array.isArray(score.eventSummary) ? score.eventSummary.length : 1))
    : 0;

  async function loadPage(params: { reset?: boolean; requestedFilter?: "all" | NewsDirection } = {}) {
    if (loading && !params.reset) return;

    const selected = params.requestedFilter ?? filter;
    const offset = params.reset ? 0 : articles.length;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setFeedError(null);

    try {
      const response = await fetch(
        `/api/news-feed?offset=${offset}&sentiment=${encodeURIComponent(selected)}`,
        { cache: "no-store" },
      );
      const payload = await response.json() as {
        articles?: NewsArticleView[];
        hasMore?: boolean;
        error?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? "뉴스를 불러오지 못했습니다.");
      if (requestId !== requestIdRef.current) return;

      const next = Array.isArray(payload.articles) ? payload.articles : [];
      setArticles((current) => {
        if (params.reset) return next;
        const known = new Set(current.map((item) => item.id));
        return [...current, ...next.filter((item) => !known.has(item.id))];
      });
      setHasMore(Boolean(payload.hasMore));
    } catch (error: unknown) {
      if (requestId === requestIdRef.current) {
        setFeedError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (filter === "all") {
      requestIdRef.current += 1;
      setArticles(data.articles);
      setHasMore(data.hasMore);
      setFeedError(null);
      setLoading(false);
      return;
    }
    void loadPage({ reset: true, requestedFilter: filter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loading && hasMore) {
          void loadPage();
        }
      },
      { rootMargin: "500px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, articles.length, filter]);

  return (
    <section className="news2-dashboard">
      <header className="news2-header">
        <div>
          <span className="section-kicker">NEWS INTELLIGENCE</span>
          <h1>뉴스 센터</h1>
          <p>해외 코인 뉴스를 MarketMind가 한국어 속보 형태로 요약합니다.</p>
        </div>
        <span className="news2-updated">
          마지막 업데이트 · {score ? formatRelativeTime(score.calculatedAt) : "대기 중"}
        </span>
      </header>

      {data.error ? (
        <section className="notice notice-error">
          <strong>뉴스 데이터를 불러오지 못했습니다.</strong>
          <span>{data.error}</span>
        </section>
      ) : null}

      <article className="panel news2-summary">
        <div className="news2-section-title"><h2>뉴스 종합 분석 (AI)</h2><small>최근 수집 뉴스 기준</small></div>
        <div className="news2-summary-grid">
          <div>
            <span>뉴스 종합 점수</span>
            <strong className={score ? `tone-${score.direction === "bullish" ? "positive" : score.direction === "bearish" ? "negative" : "neutral"}` : ""}>
              {score ? signedScore(score.weightedScore) : "—"}<small>/ 100</small>
            </strong>
            <em>{score ? directionLabel[score.direction] : "분석 대기"}</em>
          </div>
          <div>
            <span>시장 방향성</span>
            <strong className={score?.direction === "bullish" ? "paper-positive" : score?.direction === "bearish" ? "paper-negative" : ""}>
              {score ? directionText[score.direction] : "—"}
            </strong>
            <em>{score?.direction === "bullish" ? "상승 우세" : score?.direction === "bearish" ? "하락 우세" : "중립"}</em>
          </div>
          <div>
            <span>신뢰도</span>
            <strong>{score ? `${score.confidence.toFixed(0)}%` : "—"}</strong>
            <div className="news2-confidence"><i style={{ width: `${Math.max(0, Math.min(100, score?.confidence ?? 0))}%` }} /></div>
            <em>{(score?.confidence ?? 0) >= 70 ? "높음" : (score?.confidence ?? 0) >= 45 ? "보통" : "수집 중"}</em>
          </div>
          <div>
            <span>주요 이슈</span>
            <strong className="news2-purple">{issueCount || "—"}</strong>
            <em>{score?.dominantCategory ? score.dominantCategory.replaceAll("_", " ") : "분류 대기"}</em>
          </div>
        </div>
      </article>

      <article className="panel news2-featured">
        <div className="news2-section-title"><h2>주요 뉴스</h2><small>중요도 · 영향도 기준</small></div>
        {featured.length ? (
          <div className="news2-feature-grid">{featured.map((article) => <NewsCard key={article.id} article={article} />)}</div>
        ) : <div className="news2-empty">분석 완료된 BTC 뉴스가 아직 없습니다.</div>}
      </article>

      <article className="panel news2-recent">
        <div className="news2-section-title news2-filter-head">
          <div><h2>최근 뉴스</h2><small>아래로 스크롤하면 계속 불러옵니다.</small></div>
          <div className="news2-filters">
            {([["all", "전체"], ["bullish", "긍정"], ["neutral", "중립"], ["bearish", "부정"]] as const).map(([key, label]) => (
              <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="news2-feed-list">
          {articles.map((article) => (
            <a key={article.id} className="news2-feed-item" href={article.articleUrl} target="_blank" rel="noreferrer">
              <div className="news2-feed-meta">
                <span className={`news2-tag ${article.sentiment}`}>{directionLabel[article.sentiment]}</span>
                <b>{article.source}</b>
                <time>{formatRelativeTime(article.publishedAt)}</time>
                <em className={`news2-impact-text ${impactClass(article.score)}`}>영향도 {impactLabel(article)}</em>
              </div>
              <h3>{article.title}</h3>
              {article.summary ? <p>{article.summary}</p> : null}
              <div className="news2-feed-foot">
                <span>AI 영향 점수 {signedScore(article.score)}</span>
                {article.translationStatus === "completed" ? <span>한국어 요약 완료</span> : null}
              </div>
            </a>
          ))}
        </div>

        {!articles.length && !loading ? <div className="news2-empty">선택한 분류의 뉴스가 없습니다.</div> : null}
        {feedError ? <div className="news2-feed-error">{feedError}</div> : null}
        <div ref={sentinelRef} className="news2-scroll-sentinel">
          {loading ? "뉴스 불러오는 중…" : hasMore ? "스크롤하면 다음 뉴스를 불러옵니다." : articles.length ? "현재 저장된 뉴스를 모두 불러왔습니다." : ""}
        </div>
      </article>

      <p className="news2-disclaimer">AI 뉴스 요약은 원문을 대체하지 않으며 투자 판단은 사용자의 책임입니다.</p>
    </section>
  );
}
