import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { FuturesMockupDashboard } from "@/dashboard/components/FuturesMockupDashboard";
import { getGlobalFuturesPageData } from "@/dashboard/global-futures-data";
export const dynamic="force-dynamic";export const revalidate=0;
export default async function FuturesPage(){const data=await getGlobalFuturesPageData();const updatedAt=data.aggregate?.fetched_at??data.squeeze?.calculated_at??new Date().toISOString();return <MarketMindShell active="futures" updatedAt={updatedAt}><div className="terminal mock-terminal"><FuturesMockupDashboard data={data}/></div></MarketMindShell>}
