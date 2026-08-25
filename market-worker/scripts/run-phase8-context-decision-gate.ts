import "dotenv/config";
import { runPhase84ContextDecisionGate } from "../src/phase8-decision-gate/run-phase8-context-decision-gate";

runPhase84ContextDecisionGate()
  .then((r)=>console.log(JSON.stringify(r,null,2)))
  .catch((e)=>{console.error(e);process.exitCode=1;});
