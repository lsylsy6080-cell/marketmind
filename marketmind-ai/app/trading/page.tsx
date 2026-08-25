import { MarketMindShell } from "@/dashboard/components/MarketMindShell";
import { PaperTradingDashboard } from "@/dashboard/components/PaperTradingDashboard";
import { getPaperTradingData } from "@/dashboard/paper-data";

export const dynamic = "force-dynamic";

export default async function TradingPage() {
  const data = await getPaperTradingData();
  const updatedAt =
    data.openPositions[0]?.opened_at ??
    data.trades[0]?.closed_at ??
    data.account?.updated_at ??
    new Date().toISOString();

  return (
    <MarketMindShell active="trading" updatedAt={updatedAt}>
      <div className="terminal terminal-v2">
        <PaperTradingDashboard data={data} />
        <footer className="terminal-footer">
          <span>MarketMind AI · Paper Trading</span>
          <span>Simulation Only · No Live Trading</span>
        </footer>
      </div>
    </MarketMindShell>
  );
}
