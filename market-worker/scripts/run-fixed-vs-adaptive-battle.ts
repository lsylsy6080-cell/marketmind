import "dotenv/config";
import { runFixedVsAdaptiveBattle } from "../src/adaptive-battle/run-fixed-vs-adaptive-battle";
console.log(JSON.stringify(await runFixedVsAdaptiveBattle(),null,2));
