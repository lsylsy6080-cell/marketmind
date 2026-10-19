import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {testDatabase,must,migrationDir} from './helpers';

test('atomic integrated SQL preserves rows on reapply',async()=>{
 const{db,engine}=await testDatabase();try{
 await must(db.from('market_context_snapshots').insert({symbol:'BTCUSDT',context_score:42}));
 if(process.env.BUDDY4_TEST_DATABASE_URL){await engine.exec(readFileSync(new URL('FULL_TEST_SCHEMA.sql',migrationDir),'utf8'));assert.equal(Number((await must<any[]>(db.from('market_context_snapshots').select()))[0].context_score),42);}
 }finally{await db.close();}
});

test('test-gated migration runner records checksums and refuses changed history', {skip:!process.env.BUDDY4_TEST_DATABASE_URL},async()=>{
 const{db}=await testDatabase();try{
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const run=()=>spawnSync(process.execPath,['--import','tsx','scripts/migrate-buddy4.ts'],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,DATABASE_URL:db.pool.options.connectionString,BUDDY4_TEST_DATABASE:'1'}});
 let result=run();assert.equal(result.status,0,result.stderr);
 await must(db.from('market_context_snapshots').insert({symbol:'BTCUSDT',context_score:99}));
 result=run();assert.equal(result.status,0,result.stderr);
 assert.equal(Number((await must<any[]>(db.from('market_context_snapshots').select()))[0].context_score),99);
 await db.pool.query("update public.buddy4_schema_migrations set sha256='changed' where name='005_remaining_tables.sql'");
 result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/Previously applied migration changed/);
 assert.equal(Number((await must<any[]>(db.from('market_context_snapshots').select()))[0].context_score),99);
 }finally{await db.close();}
});
