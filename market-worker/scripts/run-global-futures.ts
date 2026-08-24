import "dotenv/config";
import { collectGlobalFuturesSnapshot } from "../src/global-futures/GlobalFuturesCollector";
console.log(JSON.stringify(await collectGlobalFuturesSnapshot(),null,2));
