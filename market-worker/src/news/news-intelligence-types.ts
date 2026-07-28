export type NewsEventCategory =
  | "etf"
  | "institutional"
  | "regulation"
  | "macro"
  | "geopolitics"
  | "security"
  | "mining"
  | "derivatives"
  | "market_structure"
  | "adoption"
  | "other";

export interface CategorizedNewsArticle {
  id: number;
  title: string;
  source: string;
  published_at: string;
  ai_score: number;
  importance: number;
  ai_reason: string | null;
  article_url: string;
  raw_data: Record<string, unknown> | null;
}

export interface NewsCategoryAggregate {
  category: NewsEventCategory;
  articleCount: number;
  bullishCount: number;
  neutralCount: number;
  bearishCount: number;
  weightedScore: number;
  totalWeight: number;
  impact: number;
  direction: "bullish" | "neutral" | "bearish";
  representativeTitles: string[];
}

export interface NewsEventSummaryItem {
  category: NewsEventCategory;
  direction: "bullish" | "neutral" | "bearish";
  impact: number;
  article_count: number;
  weighted_score: number;
  headline: string;
  representative_titles: string[];
}
