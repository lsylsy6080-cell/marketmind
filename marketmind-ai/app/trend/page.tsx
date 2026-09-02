import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { LongTermTrendDashboard } from "@/dashboard/components/LongTermTrendDashboard";
import { getLongTermTrendData } from "@/dashboard/long-term-trend-data";
export const dynamic="force-dynamic";
export default async function TrendPage(){const data=await getLongTermTrendData();const updatedAt=data.latest?.snapshot_hour??new Date().toISOString();return <MarketMindShell active="trend" updatedAt={updatedAt}><div className="terminal mock-terminal"><LongTermTrendDashboard latest={data.latest} history={data.history} error={data.error}/></div></MarketMindShell>}
