import "dotenv/config";
import { collectOpenInterestSnapshot } from "../src/open-interest/collect-open-interest";
console.log(JSON.stringify(await collectOpenInterestSnapshot(),null,2));
