import "dotenv/config";
import { runPerformanceBattle } from "../src/performance-battle/run-performance-battle";

const dryRun = process.env.PERFORMANCE_BATTLE_DRY_RUN === "true";
const result = await runPerformanceBattle({ dryRun });
console.log(JSON.stringify(result, null, 2));
