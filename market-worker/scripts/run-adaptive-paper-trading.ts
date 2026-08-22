import "dotenv/config";
import { runAdaptivePaperTrading } from "../src/adaptive-paper/run-adaptive-paper-trading";
const result=await runAdaptivePaperTrading();
console.log(JSON.stringify(result,null,2));
