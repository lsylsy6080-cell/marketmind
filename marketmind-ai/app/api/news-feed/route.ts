import { NextRequest, NextResponse } from "next/server";
import { getNewsArticlesPage, NEWS_PAGE_SIZE, type NewsDirection } from "@/dashboard/news-data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const offset = Math.max(0, Number(params.get("offset") ?? 0) || 0);
    const rawSentiment = params.get("sentiment") ?? "all";
    const sentiment: "all" | NewsDirection =
      rawSentiment === "bullish" || rawSentiment === "neutral" || rawSentiment === "bearish"
        ? rawSentiment
        : "all";

    const page = await getNewsArticlesPage({
      offset,
      limit: NEWS_PAGE_SIZE,
      sentiment,
    });

    return NextResponse.json(page, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { articles: [], hasMore: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
