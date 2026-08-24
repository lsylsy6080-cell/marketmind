import "dotenv/config";
import {runEstimatedLiquidationMap} from "../src/liquidation-map/run-estimated-liquidation-map";
console.log(JSON.stringify(await runEstimatedLiquidationMap(),null,2));
