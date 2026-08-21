import "dotenv/config";
import { runAdaptiveSizing } from "../src/position-sizing/run-adaptive-sizing";
const result=await runAdaptiveSizing({dryRun:process.env.ADAPTIVE_SIZING_DRY_RUN==="true"});
console.log(JSON.stringify(result,null,2));
