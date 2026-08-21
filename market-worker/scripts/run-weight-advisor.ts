import { runWeightAdvisor } from "../src/adaptive-weight/run-weight-advisor";

const result = await runWeightAdvisor();
console.log(JSON.stringify(result, null, 2));
