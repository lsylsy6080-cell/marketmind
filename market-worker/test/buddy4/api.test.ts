import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApiServer} from '@marketmind/database/api';
import {createHttpClient,createQueryClient} from '@marketmind/database';
import {createExecutor} from '@marketmind/database/postgres';
import {testDatabase,must} from './helpers';

test('authenticated API round trip, HTTPS client and read-only/injection rejection',async()=>{
 const{db}=await testDatabase();const token='test-only-token-with-at-least-thirty-two-characters';
 const jobToken='a-different-test-only-job-token-with-enough-characters';let jobs=0;
 assert.throws(()=>createApiServer({pool:db.pool,token,jobToken:token}),/separate/);
 const server=createApiServer({pool:db.pool,token,jobToken,etfJob:async()=>({jobs:++jobs}),requestsPerMinute:20});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address() as {port:number};const endpoint=`http://127.0.0.1:${address.port}/v1/query`;
 try{
 await must(db.from('market_context_snapshots').insert({symbol:'BTCUSDT',context_score:81}));
 const jobEndpoint=endpoint.replace('/v1/query','/v1/jobs/etf');
 assert.equal((await fetch(jobEndpoint,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(jobEndpoint,{method:'POST',headers:{authorization:`Bearer ${jobToken}`,'content-type':'application/json'},body:'{}'})).status,200);assert.equal(jobs,1);
 const query={operation:'select',table:'market_context_snapshots',columns:'symbol,context_score',filters:[],orders:[]};
 assert.equal((await fetch(endpoint,{method:'POST'})).status,401);
 const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({...query,operation:'delete'})})).status,403);
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({...query,columns:'pg_sleep(20)'})})).status,400);
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({...query,table:'pg_authid'})})).status,400);
 assert.equal((await fetch(endpoint,{method:'POST',headers,body:'invalid json'})).status,400);
 assert.throws(()=>createHttpClient({url:'http://example.test',token}),/HTTPS/);
 const client=createHttpClient({url:'https://buddy4.example.test',token,fetch:(_input,init)=>fetch(endpoint,init)});
 const data=await must<any>(client.from('market_context_snapshots').select('symbol,context_score').eq('symbol','BTCUSDT').maybeSingle());
 assert.equal(data.symbol,'BTCUSDT');assert.equal(Number(data.context_score),81);
 assert.ok((await client.from('market_context_snapshots').insert({symbol:'BTCUSDT'})).error);
 const connection=db.pool.connect?await db.pool.connect():db.pool;
 const restricted=createQueryClient(createExecutor(connection));
 await connection.query('SET ROLE marketmind_api_reader');
 try{assert.ok((await restricted.from('market_context_snapshots').insert({symbol:'BTCUSDT'})).error);assert.ok((await restricted.rpc('release_worker_lock_v2',{p_worker_name:'x',p_run_id:'00000000-0000-0000-0000-000000000000'})).error);}finally{await connection.query('RESET ROLE');connection.release?.();}
 const headersOnly=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(query)});assert.equal(headersOnly.headers.get('cache-control'),'no-store');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
});
