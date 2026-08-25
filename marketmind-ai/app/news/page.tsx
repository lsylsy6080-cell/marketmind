import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { NewsDashboard } from "@/dashboard/components/NewsDashboard";
import { getNewsPageData } from "@/dashboard/news-data";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const data = await getNewsPageData();
  const updatedAt = data.score?.calculatedAt ?? data.articles[0]?.publishedAt ?? new Date().toISOString();
  return <MarketMindShell active="news" updatedAt={updatedAt}>
    <div className="terminal terminal-v2">
      <NewsDashboard data={data} />
      <footer className="terminal-footer"><span>MarketMind AI · News Intelligence</span><span>AI Analysis · BTC News</span></footer>
    </div>
  </MarketMindShell>;
}
