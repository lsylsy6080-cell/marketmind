import "dotenv/config";
import { getLatestLiquidationSnapshot } from "../src/liquidation/LiquidationStreamCollector";
console.log(JSON.stringify(await getLatestLiquidationSnapshot(),null,2));
