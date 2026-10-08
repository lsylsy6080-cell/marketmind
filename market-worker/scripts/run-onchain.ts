import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { collectOnchain } from '../src/onchain/collect-onchain';
import { runOnchain } from '../src/onchain/run-onchain';
async function main() {
  if (process.argv.includes('--dry-run')) {
    const snapshot = await collectOnchain();
    await writeFile('/tmp/marketmind-onchain-dry-run.json',JSON.stringify(snapshot,null,2));
    console.log(JSON.stringify({score:snapshot.onchain_score,confidence:snapshot.onchain_confidence,metricCount:Object.keys(snapshot.metrics).length,sources:snapshot.sources,output:'/tmp/marketmind-onchain-dry-run.json'},null,2));
    if (!Object.values(snapshot.sources).some(s=>s.ok)) process.exitCode=1;
  } else await runOnchain({force:process.argv.includes('--force')});
}
main().catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
