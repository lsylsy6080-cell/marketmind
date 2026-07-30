import "dotenv/config";
import { generateMarketIntelligence } from "../src/intelligence/generate-market-intelligence";

const dryRun = ["1", "true", "yes", "on"].includes(
  String(process.env.MARKET_INTELLIGENCE_DRY_RUN ?? "false").toLowerCase(),
);

generateMarketIntelligence({ dryRun }).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[Market Intelligence] 실행 실패:", message);
  process.exitCode = 1;
});
