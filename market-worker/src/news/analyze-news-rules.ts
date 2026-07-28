import { supabase } from "../lib/supabase";
import {
  analyzeNewsByRules,
  type RuleNewsInput,
} from "./news-rule-engine";

interface PendingNewsArticle {
  id: number;
  source: string;
  title: string;
  summary: string | null;
  article_url: string;
  published_at: string;
  raw_data: Record<string, unknown> | null;
}

async function markAnalyzing(
  articleId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("news_articles")
    .update({
      analysis_status: "analyzing",
    })
    .eq("id", articleId)
    .eq("analysis_status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `뉴스 분석 상태 변경 실패: ${error.message}`,
    );
  }

  return Boolean(data);
}

export async function analyzePendingBtcNewsByRules(
  limit = 20,
): Promise<void> {
  console.log("[뉴스규칙] 미분석 뉴스 조회 시작", {
    limit,
    engine: "btc-news-rules-v1",
  });

  const { data, error } = await supabase
    .from("news_articles")
    .select(
      [
        "id",
        "source",
        "title",
        "summary",
        "article_url",
        "published_at",
        "raw_data",
      ].join(","),
    )
    .eq("asset", "BTC")
    .eq("analysis_status", "pending")
    .order("published_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    throw new Error(
      `미분석 뉴스 조회 실패: ${error.message}`,
    );
  }

  const articles =
    (data as unknown as PendingNewsArticle[] | null) ??
    [];

  if (articles.length === 0) {
    console.log("[뉴스규칙] 분석할 뉴스가 없습니다.");
    return;
  }

  let completed = 0;
  let skipped = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      const claimed = await markAnalyzing(article.id);

      if (!claimed) {
        skipped += 1;
        continue;
      }

      const input: RuleNewsInput = {
        title: article.title,
        summary: article.summary,
        source: article.source,
        publishedAt: article.published_at,
      };

      const analysis = analyzeNewsByRules(input);

      const { error: updateError } = await supabase
        .from("news_articles")
        .update({
          analysis_status: "completed",
          sentiment: analysis.sentiment,
          importance: analysis.importance,
          ai_score: analysis.aiScore,
          ai_summary: analysis.aiSummary,
          ai_reason: analysis.aiReason,
          analyzed_at: new Date().toISOString(),
          raw_data: {
            ...(article.raw_data ?? {}),
            analysis_engine: "btc-news-rules-v1",
            matched_rules: analysis.matchedRules,
          },
        })
        .eq("id", article.id);

      if (updateError) {
        throw new Error(
          `뉴스 분석 결과 저장 실패: ${updateError.message}`,
        );
      }

      completed += 1;

      console.log("[뉴스규칙] 기사 분석 완료", {
        id: article.id,
        sentiment: analysis.sentiment,
        importance: analysis.importance,
        score: analysis.aiScore,
        matchedRules: analysis.matchedRules,
      });
    } catch (error: unknown) {
      failed += 1;

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[뉴스규칙] 기사 분석 실패: ${message}`,
      );

      await supabase
        .from("news_articles")
        .update({
          analysis_status: "failed",
          raw_data: {
            ...(article.raw_data ?? {}),
            analysis_engine: "btc-news-rules-v1",
            analysis_error: message,
            analysis_failed_at: new Date().toISOString(),
          },
        })
        .eq("id", article.id);
    }
  }

  console.log("[뉴스규칙] 분석 작업 완료", {
    requested: articles.length,
    completed,
    failed,
    skipped,
  });
}
