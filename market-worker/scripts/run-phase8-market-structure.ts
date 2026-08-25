import "dotenv/config";
import { runPhase81MarketStructure } from "../src/phase8-market-structure/run-phase8-market-structure";
const r=await runPhase81MarketStructure();
console.log(JSON.stringify({status:"ok",currentPrice:r.currentPrice,support:r.nearestSupport,resistance:r.nearestResistance,performance:r.performance,strategyVersion:r.strategyVersion},null,2));
