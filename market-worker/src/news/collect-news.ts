import { createHash } from "node:crypto";
import Parser from "rss-parser";

import { supabase } from "../lib/supabase";
import { NEWS_SOURCES, type NewsSource } from "./news-sources";
import { buildEventFingerprint, calculateBtcRelevance, normalizeNewsText } from "./news-pipeline-utils";

interface RssCustomItem {
  guid?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
}

interface NewsArticleRow {
  source: string;
  source_feed_url: string;
  external_id: string;
  title: string;
  summary: string | null;
  article_url: string;
  asset: string;
  language: string;
  published_at: string;
  raw_data: Record<string, unknown>;
  relevance_score: number;
  event_fingerprint: string;
  translation_status: "pending";
}

const parser: Parser<Record<string, never>, RssCustomItem> =
  new Parser({
    timeout: 15_000,
    headers: {
      "User-Agent":
        "MarketMind-AI-News-Collector/2.0",
      Accept:
        "application/rss+xml, application/xml, text/xml, */*",
    },
  });

const BTC_KEYWORDS = [
  "bitcoin",
  "btc",
  "spot bitcoin etf",
  "bitcoin etf",
  "satoshi",
  "microstrategy",
  "strategy",
];

function normalizeWhitespace(value: string | undefined): string {
  return normalizeNewsText(value);
}

function isBtcRelevant(
  title: string,
  summary: string,
): boolean {
  const text = `${title} ${summary}`.toLowerCase();

  return BTC_KEYWORDS.some((keyword) =>
    text.includes(keyword),
  );
}

function parsePublishedAt(
  isoDate?: string,
  pubDate?: string,
): string | null {
  const candidate = isoDate ?? pubDate;

  if (!candidate) {
    return null;
  }

  const date = new Date(candidate);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function buildExternalId(
  source: NewsSource,
  guid: string | undefined,
  articleUrl: string,
): string {
  const sourceValue = guid?.trim() || articleUrl;

  return createHash("sha256")
    .update(`${source.name}:${sourceValue}`)
    .digest("hex");
}

async function collectSource(
  source: NewsSource,
): Promise<{
  fetched: number;
  relevant: number;
  saved: number;
}> {
  console.log(`[뉴스수집] ${source.name} RSS 조회 시작`);

  const feed = await parser.parseURL(source.feedUrl);

  const rows: NewsArticleRow[] = [];

  for (const item of feed.items) {
    const title = normalizeWhitespace(item.title);
    const articleUrl = item.link?.trim() ?? "";
    const summary = normalizeWhitespace(
      item.contentSnippet ??
        item.content ??
        item.summary,
    );

    if (!title || !articleUrl) {
      continue;
    }

    const relevanceScore = calculateBtcRelevance(title, summary);
    if (!isBtcRelevant(title, summary) || relevanceScore < 35) {
      continue;
    }

    const publishedAt = parsePublishedAt(
      item.isoDate,
      item.pubDate,
    );

    if (!publishedAt) {
      console.warn(
        `[뉴스수집] 발행일 파싱 실패로 제외: ${title}`,
      );
      continue;
    }

    rows.push({
      source: source.name,
      source_feed_url: source.feedUrl,
      external_id: buildExternalId(
        source,
        item.guid,
        articleUrl,
      ),
      title,
      summary: summary || null,
      article_url: articleUrl,
      asset: source.asset,
      language: source.language,
      published_at: publishedAt,
      relevance_score: relevanceScore,
      event_fingerprint: buildEventFingerprint(title),
      translation_status: "pending",
      raw_data: {
        guid: item.guid ?? null,
        creator: item.creator ?? null,
        feed_title: feed.title ?? null,
      },
    });
  }

  if (rows.length === 0) {
    console.log(
      `[뉴스수집] ${source.name}: BTC 관련 신규 후보가 없습니다.`,
    );

    return {
      fetched: feed.items.length,
      relevant: 0,
      saved: 0,
    };
  }

  const { error } = await supabase
    .from("news_articles")
    .upsert(rows, {
      onConflict: "article_url",
      ignoreDuplicates: true,
    });

  if (error) {
    throw new Error(
      `${source.name} 뉴스 저장 실패: ${error.message}`,
    );
  }

  console.log(
    `[뉴스수집] ${source.name}: 전체 ${feed.items.length}개 중 BTC 관련 ${rows.length}개 반영`,
  );

  return {
    fetched: feed.items.length,
    relevant: rows.length,
    saved: rows.length,
  };
}

export async function collectBtcNews(): Promise<void> {
  const sources = NEWS_SOURCES.filter(
    (source) => source.enabled,
  );

  if (sources.length === 0) {
    console.log("[뉴스수집] 활성화된 RSS 소스가 없습니다.");
    return;
  }

  let totalFetched = 0;
  let totalRelevant = 0;
  let totalSaved = 0;

  for (const source of sources) {
    try {
      const result = await collectSource(source);

      totalFetched += result.fetched;
      totalRelevant += result.relevant;
      totalSaved += result.saved;
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      console.error(
        `[뉴스수집] ${source.name} 처리 실패: ${message}`,
      );
    }
  }

  console.log("[뉴스수집] 수집 완료", {
    sourceCount: sources.length,
    fetched: totalFetched,
    btcRelevant: totalRelevant,
    reflected: totalSaved,
  });
}
