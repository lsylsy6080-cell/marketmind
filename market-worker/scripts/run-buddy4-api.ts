import 'dotenv/config';
import { createPostgresClient } from '@marketmind/database/postgres';
import { createApiServer } from '@marketmind/database/api';
import { randomUUID } from 'node:crypto';
import { database } from '../src/lib/database';
import { runEtfCollector } from '../src/etf/collector';
const token=process.env.BUDDY4_API_TOKEN;
if(!token)throw new Error('BUDDY4_API_TOKEN is required');
if(!process.env.BUDDY4_API_DATABASE_URL)throw new Error('BUDDY4_API_DATABASE_URL must use the read-only dashboard role');
const db=database;
const reader=createPostgresClient({connectionString:process.env.BUDDY4_API_DATABASE_URL,readOnly:true});
const server=createApiServer({pool:reader.pool,token,jobToken:process.env.BUDDY4_JOB_TOKEN,etfJob:async()=>{
 const runId=randomUUID(),worker='buddy4-etf-job';
 const lock=await db.rpc('acquire_worker_lock_v2',{p_worker_name:worker,p_run_id:runId,p_ttl_seconds:3600});
 if(lock.error)throw new Error(lock.error.message);
 if(!lock.data)return {status:'skipped',reason:'ETF collector already running'};
 try{return await runEtfCollector();}
 finally{await db.rpc('release_worker_lock_v2',{p_worker_name:worker,p_run_id:runId});}
}});
const port=Number(process.env.BUDDY4_API_PORT??8787);
server.listen(port,'127.0.0.1',()=>console.log(`[Buddy4 API] listening on loopback port ${port}`));
for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>server.close(()=>void Promise.all([db.close(),reader.close()]).then(()=>process.exit(0))));
