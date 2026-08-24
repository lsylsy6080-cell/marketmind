import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { GlobalFuturesDashboard } from "@/dashboard/components/GlobalFuturesDashboard";
import { getGlobalFuturesPageData } from "@/dashboard/global-futures-data";
export const dynamic="force-dynamic";export const revalidate=0;
export default async function FuturesPage(){const data=await getGlobalFuturesPageData();const updatedAt=data.aggregate?.fetched_at??data.squeeze?.calculated_at??new Date().toISOString();return <MarketMindShell active="futures" updatedAt={updatedAt}><div className="terminal terminal-v2"><GlobalFuturesDashboard data={data}/><footer className="terminal-footer"><span>MarketMind AI · Global Futures Intelligence</span><span>Estimated Squeeze Zones · Paper Trading Only</span></footer></div></MarketMindShell>}
