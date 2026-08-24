import "dotenv/config";
import { LiquidationStreamCollector } from "../src/liquidation/LiquidationStreamCollector";

const durationSeconds=Math.max(65,Number(process.env.LIQUIDATION_TEST_SECONDS??75));
const collector=new LiquidationStreamCollector();

console.log(`[Liquidation] test stream ${durationSeconds}s 시작`);
await collector.start();
await new Promise(resolve=>setTimeout(resolve,durationSeconds*1000));
await collector.stop();
console.log("[Liquidation] test stream 종료");
