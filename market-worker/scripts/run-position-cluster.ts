import "dotenv/config";
import {runPositionClusterMap} from "../src/position-cluster/run-position-cluster";
console.log(JSON.stringify(await runPositionClusterMap(),null,2));
