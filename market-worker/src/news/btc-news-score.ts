import { supabase } from "../lib/supabase";
import {
  buildNewsDuplicateGroups,
  type DedupeNewsArticle,
} from "./news-dedupe";

type NewsSentiment =
  | "bullish"
  | "neutral"
  | "bearish";

interface CompletedNewsArticle
  extends DedupeNewsArticle {
  sentiment: NewsSentiment;
  importance: number;
  ai_score: number;
  ai_summary: string | null;
  article_url: string;
}

interface WeightedArticle {
  article: CompletedNewsArticle;
  sourceWeight: number;
  freshnessWeight: number;
  importanceWeight: number;
  duplicateWeight: number;
  finalWeight: number;
  weightedContribution: number;
  ageHours: number;
}

interface TopArticle {
  id: number;
  source: string;
  title: string;
  article_url: string;
  score: number;
  importance: number;
  weight: number;
  age_hours: number;
}

const SOURCE_WEIGHTS: Record<string, number> = {
  CoinDesk: 1,
  Decrypt: 0.94,
  Cointelegraph: 0.9,
  Reuters: 1.08,
  Bloomberg: 1.08,
};

const DEFAULT_SOURCE_WEIGHT = 0.86;
const HALF_LIFE_HOURS = 12;

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

function getSourceWeight(source: string): number {
  return (
    SOURCE_WEIGHTS[source] ??
    DEFAULT_SOURCE_WEIGHT
  );
}

function getFreshnessWeight(
  ageHours: number,
): number {
  return Math.pow(
    0.5,
    ageHours / HALF_LIFE_HOURS,
  );
}

function getImportanceWeight(
  importance: number,
): number {
  return 0.45 + clamp(importance, 1, 10) / 10;
}

function determineDirection(
  score: number,
): NewsSentiment {
  if (score >= 57) {
    return "bullish";
  }

  if (score <= 43) {
    return "bearish";
  }

  return "neutral";
}

function determineRiskLevel(
  score: number,
  bearishRatio: number,
  confidence: number,
): "low" | "normal" | "high" | "critical" {
  if (
    score <= 25 &&
    bearishRatio >= 0.65 &&
    confidence >= 65
  ) {
    return "critical";
  }

  if (
    score <= 38 &&
    bearishRatio >= 0.5
  ) {
    return "high";
  }

  if (
    score >= 62 &&
    bearishRatio <= 0.25
  ) {
    return "low";
  }

  return "normal";
}

function chooseRepresentativeArticle(
  group: CompletedNewsArticle[],
): CompletedNewsArticle {
  return [...group].sort((left, right) => {
    const importanceDifference =
      right.importance - left.importance;

    if (importanceDifference !== 0) {
      return importanceDifference;
    }

    const sourceDifference =
      getSourceWeight(right.source) -
      getSourceWeight(left.source);

    if (sourceDifference !== 0) {
      return sourceDifference;
    }

    return (
      new Date(right.published_at).getTime() -
      new Date(left.published_at).getTime()
    );
  })[0];
}

function buildWeightedArticles(
  groups: CompletedNewsArticle[][],
  now: Date,
): WeightedArticle[] {
  return groups.map((group) => {
    const article =
      chooseRepresentativeArticle(group);

    const ageHours = Math.max(
      0,
      (now.getTime() -
        new Date(article.published_at).getTime()) /
        (1000 * 60 * 60),
    );

    const sourceWeight =
      getSourceWeight(article.source);
    const freshnessWeight =
      getFreshnessWeight(ageHours);
    const importanceWeight =
      getImportanceWeight(article.importance);

    const duplicateWeight =
      1 + Math.min(group.length - 1, 3) * 0.08;

    const finalWeight =
      sourceWeight *
      freshnessWeight *
      importanceWeight *
      duplicateWeight;

    return {
      article,
      sourceWeight,
      freshnessWeight,
      importanceWeight,
      duplicateWeight,
      finalWeight,
      weightedContribution:
        (article.ai_score - 50) * finalWeight,
      ageHours,
    };
  });
}

function toTopArticle(
  item: WeightedArticle,
): TopArticle {
  return {
    id: item.article.id,
    source: item.article.source,
    title: item.article.title,
    article_url: item.article.article_url,
    score: item.article.ai_score,
    importance: item.article.importance,
    weight: round2(item.finalWeight),
    age_hours: round2(item.ageHours),
  };
}

export async function generateBtcNewsScore(
  windowHours = 24,
): Promise<void> {
  console.log("[뉴스점수] 계산 시작", {
    windowHours,
    strategyVersion: "btc-news-score-v1",
  });

  const calculatedAt = new Date();
  const cutoff = new Date(
    calculatedAt.getTime() -
      windowHours * 60 * 60 * 1000,
  );

  const { data, error } = await supabase
    .from("news_articles")
    .select(
      [
        "id",
        "source",
        "title",
        "article_url",
        "published_at",
        "sentiment",
        "importance",
        "ai_score",
        "ai_summary",
      ].join(","),
    )
    .eq("asset", "BTC")
    .eq("analysis_status", "completed")
    .gte(
      "published_at",
      cutoff.toISOString(),
    )
    .order("published_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(
      `뉴스 종합점수용 기사 조회 실패: ${error.message}`,
    );
  }

  const articles =
    (data as unknown as
      | CompletedNewsArticle[]
      | null) ?? [];

  if (articles.length === 0) {
    console.log(
      "[뉴스점수] 계산 대상 뉴스가 없습니다.",
    );
    return;
  }

  const groups =
    buildNewsDuplicateGroups(articles);
  const weightedArticles =
    buildWeightedArticles(
      groups,
      calculatedAt,
    );

  const totalWeight =
    weightedArticles.reduce(
      (sum, item) =>
        sum + item.finalWeight,
      0,
    );

  const weightedContribution =
    weightedArticles.reduce(
      (sum, item) =>
        sum + item.weightedContribution,
      0,
    );

  const rawAverageScore =
    articles.reduce(
      (sum, article) =>
        sum + article.ai_score,
      0,
    ) / articles.length;

  const weightedScore =
    totalWeight > 0
      ? clamp(
          50 +
            weightedContribution /
              totalWeight,
          0,
          100,
        )
      : 50;

  const bullishCount = articles.filter(
    (article) =>
      article.sentiment === "bullish",
  ).length;
  const neutralCount = articles.filter(
    (article) =>
      article.sentiment === "neutral",
  ).length;
  const bearishCount = articles.filter(
    (article) =>
      article.sentiment === "bearish",
  ).length;

  const averageImportance =
    articles.reduce(
      (sum, article) =>
        sum + article.importance,
      0,
    ) / articles.length;

  const freshnessCoverage =
    weightedArticles.reduce(
      (sum, item) =>
        sum + item.freshnessWeight,
      0,
    ) / weightedArticles.length;

  const sourceQuality =
    weightedArticles.reduce(
      (sum, item) =>
        sum + item.sourceWeight,
      0,
    ) / weightedArticles.length;

  const articleVolumeConfidence =
    Math.min(
      weightedArticles.length / 8,
      1,
    );

  const confidence = clamp(
    articleVolumeConfidence * 35 +
      (averageImportance / 10) * 30 +
      freshnessCoverage * 20 +
      Math.min(sourceQuality, 1) * 15,
    0,
    100,
  );

  const direction =
    determineDirection(weightedScore);
  const bearishRatio =
    bearishCount / articles.length;
  const riskLevel =
    determineRiskLevel(
      weightedScore,
      bearishRatio,
      confidence,
    );

  const topPositive = [...weightedArticles]
    .filter(
      (item) =>
        item.article.ai_score > 50,
    )
    .sort(
      (left, right) =>
        right.weightedContribution -
        left.weightedContribution,
    )
    .slice(0, 3)
    .map(toTopArticle);

  const topNegative = [...weightedArticles]
    .filter(
      (item) =>
        item.article.ai_score < 50,
    )
    .sort(
      (left, right) =>
        left.weightedContribution -
        right.weightedContribution,
    )
    .slice(0, 3)
    .map(toTopArticle);

  const scoreDetails = {
    engine: "btc-news-score-v1",
    half_life_hours: HALF_LIFE_HOURS,
    source_weights: SOURCE_WEIGHTS,
    total_weight: round2(totalWeight),
    average_importance:
      round2(averageImportance),
    freshness_coverage:
      round2(freshnessCoverage),
    source_quality:
      round2(sourceQuality),
    duplicate_group_count:
      groups.length,
    duplicate_articles_removed:
      articles.length - groups.length,
    weighted_articles:
      weightedArticles.map((item) => ({
        id: item.article.id,
        source: item.article.source,
        score: item.article.ai_score,
        importance:
          item.article.importance,
        age_hours: round2(
          item.ageHours,
        ),
        source_weight: round2(
          item.sourceWeight,
        ),
        freshness_weight: round2(
          item.freshnessWeight,
        ),
        importance_weight: round2(
          item.importanceWeight,
        ),
        duplicate_weight: round2(
          item.duplicateWeight,
        ),
        final_weight: round2(
          item.finalWeight,
        ),
      })),
  };

  const { error: insertError } =
    await supabase
      .from("news_scores")
      .insert({
        symbol: "BTCUSDT",
        calculated_at:
          calculatedAt.toISOString(),
        window_hours: windowHours,
        article_count: articles.length,
        unique_article_count:
          groups.length,
        bullish_count: bullishCount,
        neutral_count: neutralCount,
        bearish_count: bearishCount,
        raw_average_score:
          round2(rawAverageScore),
        weighted_score:
          round2(weightedScore),
        confidence: round2(confidence),
        direction,
        risk_level: riskLevel,
        top_positive: topPositive,
        top_negative: topNegative,
        score_details: scoreDetails,
        strategy_version:
          "btc-news-score-v1",
      });

  if (insertError) {
    throw new Error(
      `뉴스 종합점수 저장 실패: ${insertError.message}`,
    );
  }

  console.log("[뉴스점수] 저장 완료", {
    articleCount: articles.length,
    uniqueArticleCount: groups.length,
    weightedScore:
      round2(weightedScore),
    confidence:
      round2(confidence),
    direction,
    riskLevel,
  });
}
