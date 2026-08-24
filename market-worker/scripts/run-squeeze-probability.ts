import "dotenv/config";
import {runSqueezeProbability} from "../src/squeeze/run-squeeze-probability";
console.log(JSON.stringify(await runSqueezeProbability(),null,2));
