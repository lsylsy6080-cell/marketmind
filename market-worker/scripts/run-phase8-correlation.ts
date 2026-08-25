import "dotenv/config";
import { runPhase82Correlation } from "../src/phase8-correlation/run-phase8-correlation";
async function main(){const result=await runPhase82Correlation();console.log(JSON.stringify(result,null,2));}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
