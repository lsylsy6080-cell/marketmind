import "dotenv/config";
import { runDecisionV2 } from "../src/decision-v2/run-decision-v2";

const dryRun = process.env.DECISION_V2_DRY_RUN === "true";
const result = await runDecisionV2({ dryRun });
console.log(JSON.stringify(result, null, 2));
