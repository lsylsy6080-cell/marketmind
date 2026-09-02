import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { OnchainMockupDashboard } from "@/dashboard/components/OnchainMockupDashboard";
import { getOnchainData } from "@/dashboard/onchain-data";
export const dynamic="force-dynamic";
export default async function OnchainPage(){const data=await getOnchainData();const latest=data.latest;const updatedAt=String(latest?.snapshot_time??latest?.snapshot_hour??latest?.calculated_at??new Date().toISOString());return <MarketMindShell active="onchain" updatedAt={updatedAt}><div className="terminal mock-terminal"><OnchainMockupDashboard latest={data.latest} history={data.history} connected={data.connected} error={data.error}/></div></MarketMindShell>}
