import "dotenv/config";
import { runPhase83MarketContext } from "../src/phase8-context/run-phase8-market-context";
runPhase83MarketContext().then(r=>console.log(`[8-3] ${r.permission.toUpperCase()} · ${r.preferredDirection.toUpperCase()} · context=${r.contextScore.toFixed(1)} · risk=${r.riskScore.toFixed(1)}`)).catch(e=>{console.error(e);process.exitCode=1;});
