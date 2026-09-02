import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { TradingMockupDashboard } from "@/dashboard/components/TradingMockupDashboard";
import { getPaperTradingData } from "@/dashboard/paper-data";
export const dynamic="force-dynamic";
export default async function TradingPage(){const data=await getPaperTradingData();const updatedAt=data.openPositions[0]?.opened_at??data.trades[0]?.closed_at??data.account?.updated_at??new Date().toISOString();return <MarketMindShell active="trading" updatedAt={updatedAt}><div className="terminal mock-terminal"><TradingMockupDashboard data={data}/></div></MarketMindShell>}
