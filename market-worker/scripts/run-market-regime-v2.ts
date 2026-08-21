import "dotenv/config";
import { runMarketRegimeV2 } from "../src/regime/run-market-regime-v2";

const dryRun = process.env.MARKET_REGIME_DRY_RUN === "true";
const result = await runMarketRegimeV2({ dryRun });
console.log(JSON.stringify(result, null, 2));
