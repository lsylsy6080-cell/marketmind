import "dotenv/config";
import { runSqueezeEarlyWarning } from "../src/squeeze-warning/run-squeeze-early-warning";
console.log(JSON.stringify(await runSqueezeEarlyWarning(), null, 2));
