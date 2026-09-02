import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { NewsMockupDashboard } from "@/dashboard/components/NewsMockupDashboard";
import { getNewsPageData } from "@/dashboard/news-data";
export const dynamic="force-dynamic";
export default async function NewsPage(){const data=await getNewsPageData();const updatedAt=data.score?.calculatedAt??data.articles[0]?.publishedAt??new Date().toISOString();return <MarketMindShell active="news" updatedAt={updatedAt}><div className="terminal mock-terminal"><NewsMockupDashboard data={data}/></div></MarketMindShell>}
