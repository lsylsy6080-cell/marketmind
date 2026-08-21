import { runFundingRawAudit } from "../src/funding-audit/FundingRawAudit";
console.log(JSON.stringify(await runFundingRawAudit(), null, 2));
