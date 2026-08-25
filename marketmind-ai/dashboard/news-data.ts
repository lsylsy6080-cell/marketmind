import { createAdminClient } from "@/lib/supabase/admin";

export type NewsDirection = "bullish" | "neutral" | "bearish";

export interface NewsArticleView {
  id: number;
  source: string;
  title: string;
  originalTitle: string;
  summary: string | null;
  originalSummary: string | null;
  articleUrl: string;
  publishedAt: string;
  sentiment: NewsDirection;
  importance: number;
  score: number;
  relevanceScore: number;
  impactLevel: string | null;
  translationStatus: string | null;
}

export interface NewsScoreView {
  calculatedAt: string;
  weightedScore: number;
  confidence: number;
  direction: NewsDirection;
  riskLevel: string;
  articleCount: number;
  uniqueArticleCount: number;
  bullishCount: number;
  neutralCount: number;
  bearishCount: number;
  dominantCategory: string | null;
  eventSummary: unknown;
}

export interface NewsPageData {
  score: NewsScoreView | null;
  articles: NewsArticleView[];
  hasMore: boolean;
  error: string | null;
}

export const NEWS_PAGE_SIZE = 20;

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const direction = (value: unknown): NewsDirection =>
  value === "bullish" || value === "bearish" ? value : "neutral";

function mapArticle(row: any): NewsArticleView {
  const originalTitle = String(row.title ?? "제목 없음");
  const originalSummary = row.ai_summary
    ? String(row.ai_summary)
    : row.summary
      ? String(row.summary)
      : null;
  const localizedTitle = row.localized_title ? String(row.localized_title).trim() : "";
  const localizedSummary = row.localized_summary ? String(row.localized_summary).trim() : "";

  return {
    id: Number(row.id),
    source: String(row.source ?? "Unknown"),
    title: localizedTitle || originalTitle,
    originalTitle,
    summary: localizedSummary || originalSummary,
    originalSummary,
    articleUrl: String(row.article_url ?? "#"),
    publishedAt: String(row.published_at ?? new Date().toISOString()),
    sentiment: direction(row.sentiment),
    importance: num(row.importance),
    score: num(row.ai_score, 50),
    relevanceScore: num(row.relevance_score),
    impactLevel: row.impact_level ? String(row.impact_level) : null,
    translationStatus: row.translation_status ? String(row.translation_status) : null,
  };
}

export async function getNewsArticlesPage(params?: {
  offset?: number;
  limit?: number;
  sentiment?: "all" | NewsDirection;
}): Promise<{ articles: NewsArticleView[]; hasMore: boolean }> {
  const offset = Math.max(0, params?.offset ?? 0);
  const limit = Math.min(50, Math.max(1, params?.limit ?? NEWS_PAGE_SIZE));
  const sentiment = params?.sentiment ?? "all";
  const supabase = createAdminClient();

  let query = supabase
    .from("news_articles")
    .select("id,source,title,summary,article_url,published_at,sentiment,importance,ai_score,ai_summary,analysis_status,localized_title,localized_summary,translation_status,relevance_score,impact_level,is_duplicate")
    .eq("asset", "BTC")
    .eq("analysis_status", "completed")
    .eq("is_duplicate", false)
    .order("published_at", { ascending: false })
    .range(offset, offset + limit);

  if (sentiment !== "all") query = query.eq("sentiment", sentiment);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  return {
    articles: rows.slice(0, limit).map(mapArticle),
    hasMore: rows.length > limit,
  };
}

export async function getNewsPageData(): Promise<NewsPageData> {
  try {
    const supabase = createAdminClient();
    const [scoreResult, page] = await Promise.all([
      supabase
        .from("news_scores")
        .select("*")
        .eq("symbol", "BTCUSDT")
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      getNewsArticlesPage({ offset: 0, limit: NEWS_PAGE_SIZE, sentiment: "all" }),
    ]);

    if (scoreResult.error) throw scoreResult.error;

    const rawScore = scoreResult.data as Record<string, unknown> | null;
    const score: NewsScoreView | null = rawScore ? {
      calculatedAt: String(rawScore.calculated_at ?? new Date().toISOString()),
      weightedScore: num(rawScore.weighted_score, 50),
      confidence: num(rawScore.confidence),
      direction: direction(rawScore.direction),
      riskLevel: String(rawScore.risk_level ?? "normal"),
      articleCount: num(rawScore.article_count),
      uniqueArticleCount: num(rawScore.unique_article_count),
      bullishCount: num(rawScore.bullish_count),
      neutralCount: num(rawScore.neutral_count),
      bearishCount: num(rawScore.bearish_count),
      dominantCategory: rawScore.dominant_category ? String(rawScore.dominant_category) : null,
      eventSummary: rawScore.event_summary ?? null,
    } : null;

    return { score, articles: page.articles, hasMore: page.hasMore, error: null };
  } catch (error: unknown) {
    return {
      score: null,
      articles: [],
      hasMore: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
