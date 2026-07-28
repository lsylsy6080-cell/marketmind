import { supabase } from "../lib/supabase";
import {
  categorizeNewsArticle,
} from "./news-event-categorizer";
import type {
  CategorizedNewsArticle,
  NewsCategoryAggregate,
  NewsEventCategory,
  NewsEventSummaryItem,
} from "./news-intelligence-types";

type Direction =
  | "bullish"
  | "neutral"
  | "bearish";

interface WeightedCategorizedArticle {
  article: CategorizedNewsArticle;
  categories: NewsEventCategory[];
  finalWeight: number;
}

interface LatestNewsScoreWeightedArticle {
  id: number;
  final_weight: number;
  [key: string]: unknown;
}

interface LatestNewsScoreDetails {
  weighted_articles?: LatestNewsScoreWeightedArticle[];
  [key: string]: unknown;
}

interface LatestNewsScoreRecord {
  id: number;
  calculated_at: string;
  window_hours: number;
  weighted_score: number | string;
  confidence: number | string;
  score_details: LatestNewsScoreDetails | null;
}

const CATEGORY_IMPORTANCE: Record<
  NewsEventCategory,
  number
> = {
  etf: 1.2,
  institutional: 1.1,
  regulation: 1.15,
  macro: 1.2,
  geopolitics: 1.05,
  security: 1.2,
  mining: 0.85,
  derivatives: 1,
  market_structure: 0.9,
  adoption: 0.95,
  other: 0.65,
};

function clamp(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function determineDirection(
  score: number,
): Direction {
  if (score >= 57) {
    return "bullish";
  }

  if (score <= 43) {
    return "bearish";
  }

  return "neutral";
}

function getMarketPressure(
  score: number,
  confidence: number,
): string {
  if (score >= 70 && confidence >= 60) {
    return "strong_bullish";
  }

  if (score >= 57) {
    return "bullish";
  }

  if (score <= 30 && confidence >= 60) {
    return "strong_bearish";
  }

  if (score <= 43) {
    return "bearish";
  }

  return "balanced";
}

function buildCategoryHeadline(
  aggregate: NewsCategoryAggregate,
): string {
  const labels: Record<
    NewsEventCategory,
    string
  > = {
    etf: "ETF 자금 흐름",
    institutional: "기관·기업 수급",
    regulation: "규제 환경",
    macro: "거시경제·통화정책",
    geopolitics: "지정학적 환경",
    security: "보안·기술 위험",
    mining: "채굴 생태계",
    derivatives: "파생상품 시장",
    market_structure: "시장 구조",
    adoption: "비트코인 채택",
    other: "기타 뉴스",
  };

  const directionText =
    aggregate.direction === "bullish"
      ? "강세"
      : aggregate.direction === "bearish"
        ? "약세"
        : "중립";

  return `${labels[aggregate.category]}가 ${directionText} 방향으로 작용 중`;
}

function aggregateCategories(
  weightedArticles: WeightedCategorizedArticle[],
): NewsCategoryAggregate[] {
  const categories = new Map<
    NewsEventCategory,
    {
      articles: WeightedCategorizedArticle[];
      weightedContribution: number;
      totalWeight: number;
    }
  >();

  for (const item of weightedArticles) {
    for (const category of item.categories) {
      const categoryWeight =
        CATEGORY_IMPORTANCE[category];
      const splitWeight =
        item.finalWeight *
        categoryWeight /
        item.categories.length;

      const current = categories.get(category) ?? {
        articles: [],
        weightedContribution: 0,
        totalWeight: 0,
      };

      current.articles.push(item);
      current.weightedContribution +=
        (item.article.ai_score - 50) *
        splitWeight;
      current.totalWeight += splitWeight;

      categories.set(category, current);
    }
  }

  return [...categories.entries()]
    .map(([category, data]) => {
      const articleMap = new Map<
        number,
        WeightedCategorizedArticle
      >();

      for (const item of data.articles) {
        articleMap.set(item.article.id, item);
      }

      const uniqueArticles = [
        ...articleMap.values(),
      ];

      const weightedScore =
        data.totalWeight > 0
          ? clamp(
              50 +
                data.weightedContribution /
                  data.totalWeight,
              0,
              100,
            )
          : 50;

      const bullishCount =
        uniqueArticles.filter(
          (item) =>
            item.article.ai_score >= 58,
        ).length;

      const bearishCount =
        uniqueArticles.filter(
          (item) =>
            item.article.ai_score <= 42,
        ).length;

      const neutralCount =
        uniqueArticles.length -
        bullishCount -
        bearishCount;

      const impact =
        Math.abs(weightedScore - 50) *
        Math.log2(uniqueArticles.length + 1) *
        CATEGORY_IMPORTANCE[category];

      return {
        category,
        articleCount:
          uniqueArticles.length,
        bullishCount,
        neutralCount,
        bearishCount,
        weightedScore:
          round2(weightedScore),
        totalWeight:
          round2(data.totalWeight),
        impact: round2(impact),
        direction:
          determineDirection(weightedScore),
        representativeTitles:
          uniqueArticles
            .sort(
              (left, right) =>
                right.article.importance -
                left.article.importance,
            )
            .slice(0, 3)
            .map((item) =>
              item.article.title,
            ),
      };
    })
    .sort(
      (left, right) =>
        right.impact - left.impact,
    );
}

function calculateConflictScore(
  articles: CategorizedNewsArticle[],
): number {
  const bullishStrength =
    articles
      .filter((article) =>
        article.ai_score > 50,
      )
      .reduce(
        (sum, article) =>
          sum +
          (article.ai_score - 50) *
            article.importance,
        0,
      );

  const bearishStrength =
    articles
      .filter((article) =>
        article.ai_score < 50,
      )
      .reduce(
        (sum, article) =>
          sum +
          (50 - article.ai_score) *
            article.importance,
        0,
      );

  const maxStrength = Math.max(
    bullishStrength,
    bearishStrength,
  );

  if (maxStrength === 0) {
    return 0;
  }

  return round2(
    clamp(
      (Math.min(
        bullishStrength,
        bearishStrength,
      ) /
        maxStrength) *
        100,
      0,
      100,
    ),
  );
}

export async function enrichLatestBtcNewsScore(): Promise<void> {
  console.log(
    "[뉴스인텔리전스V2] 최신 뉴스점수 확장 시작",
  );

  const {
    data: scoreDataRaw,
    error: scoreError,
  } = await supabase
    .from("news_scores")
    .select(
      "id, calculated_at, window_hours, weighted_score, confidence, score_details",
    )
    .eq("symbol", "BTCUSDT")
    .order("calculated_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (scoreError) {
    throw new Error(
      `최신 뉴스점수 조회 실패: ${scoreError.message}`,
    );
  }

  if (!scoreDataRaw) {
    console.log(
      "[뉴스인텔리전스V2] 확장할 뉴스점수가 없습니다.",
    );
    return;
  }

  const scoreData =
    scoreDataRaw as unknown as LatestNewsScoreRecord;

  const calculatedAt = new Date(
    scoreData.calculated_at,
  );
  const cutoff = new Date(
    calculatedAt.getTime() -
      scoreData.window_hours *
        60 *
        60 *
        1000,
  );

  const { data, error } = await supabase
    .from("news_articles")
    .select(
      [
        "id",
        "title",
        "source",
        "published_at",
        "ai_score",
        "importance",
        "ai_reason",
        "article_url",
        "raw_data",
      ].join(","),
    )
    .eq("asset", "BTC")
    .eq("analysis_status", "completed")
    .gte(
      "published_at",
      cutoff.toISOString(),
    )
    .lte(
      "published_at",
      calculatedAt.toISOString(),
    );

  if (error) {
    throw new Error(
      `뉴스 인텔리전스 기사 조회 실패: ${error.message}`,
    );
  }

  const articles =
    (data as unknown as
      | CategorizedNewsArticle[]
      | null) ?? [];

  if (articles.length === 0) {
    console.log(
      "[뉴스인텔리전스V2] 대상 기사가 없습니다.",
    );
    return;
  }

  const detailRows =
    scoreData.score_details?.weighted_articles ??
    [];

  const weightById = new Map<
    number,
    number
  >(
    detailRows.map((item) => [
      Number(item.id),
      Number(item.final_weight),
    ]),
  );

  const weightedArticles:
    WeightedCategorizedArticle[] =
    articles.map((article) => ({
      article,
      categories:
        categorizeNewsArticle(article),
      finalWeight:
        weightById.get(article.id) ??
        0.5,
    }));

  const aggregates =
    aggregateCategories(
      weightedArticles,
    );

  const dominantCategory =
    aggregates[0]?.category ?? "other";

  const conflictScore =
    calculateConflictScore(articles);

  const marketPressure =
    getMarketPressure(
      Number(scoreData.weighted_score),
      Number(scoreData.confidence),
    );

  const eventSummary:
    NewsEventSummaryItem[] =
    aggregates
      .slice(0, 5)
      .map((aggregate) => ({
        category: aggregate.category,
        direction: aggregate.direction,
        impact: aggregate.impact,
        article_count:
          aggregate.articleCount,
        weighted_score:
          aggregate.weightedScore,
        headline:
          buildCategoryHeadline(
            aggregate,
          ),
        representative_titles:
          aggregate.representativeTitles,
      }));

  const eventCategories =
    Object.fromEntries(
      aggregates.map((aggregate) => [
        aggregate.category,
        {
          article_count:
            aggregate.articleCount,
          bullish_count:
            aggregate.bullishCount,
          neutral_count:
            aggregate.neutralCount,
          bearish_count:
            aggregate.bearishCount,
          weighted_score:
            aggregate.weightedScore,
          total_weight:
            aggregate.totalWeight,
          impact: aggregate.impact,
          direction:
            aggregate.direction,
        },
      ]),
    );

  const { error: updateError } =
    await supabase
      .from("news_scores")
      .update({
        event_categories:
          eventCategories,
        dominant_category:
          dominantCategory,
        market_pressure:
          marketPressure,
        conflict_score:
          conflictScore,
        event_summary:
          eventSummary,
        strategy_version:
          "btc-news-score-v2",
        score_details: {
          ...(scoreData.score_details ?? {}),
          intelligence_version:
            "btc-news-intelligence-v2",
          categorized_articles:
            weightedArticles.map(
              (item) => ({
                id: item.article.id,
                categories:
                  item.categories,
              }),
            ),
        },
      })
      .eq("id", scoreData.id);

  if (updateError) {
    throw new Error(
      `뉴스 인텔리전스 저장 실패: ${updateError.message}`,
    );
  }

  console.log(
    "[뉴스인텔리전스V2] 저장 완료",
    {
      newsScoreId: scoreData.id,
      dominantCategory,
      marketPressure,
      conflictScore,
      categoryCount:
        aggregates.length,
    },
  );
}
