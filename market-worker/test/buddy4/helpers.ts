import { randomUUID } from 'node:crypto';
import { readFileSync,readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { DatabaseClient } from '@marketmind/database';
import { createPostgresClient } from '@marketmind/database/postgres';
export const migrationDir=new URL('../../migrations/buddy4/',import.meta.url);
export async function testDatabase(){
 interface Engine { query<T=Record<string,unknown>>(sql:string,args?:unknown[]):Promise<{rows:T[]}>; exec(sql:string):Promise<unknown> }
 let engine:Engine, db:DatabaseClient & {pool:any;close():Promise<void>};
 if(process.env.BUDDY4_TEST_DATABASE_URL){
  const admin=createPostgresClient({connectionString:process.env.BUDDY4_TEST_DATABASE_URL});
  const {rows:[{name}]}=await admin.pool.query('select current_database() AS name');
  if(!name.endsWith('_test')){await admin.close();throw new Error('Test URL must point to *_test; refusing production database');}
  const temporary='mm_'+randomUUID().replaceAll('-','')+'_test';
  await admin.pool.query('CREATE DATABASE '+temporary);
  const url=new URL(process.env.BUDDY4_TEST_DATABASE_URL);url.pathname='/'+temporary;
  db=createPostgresClient({connectionString:url.toString()});
  const close=db.close;
  db.close=async()=>{await close();await admin.pool.query('DROP DATABASE '+temporary);await admin.close();};
  engine={query:(sql:string,args?:unknown[])=>db.pool.query(sql,args),exec:(sql:string)=>db.pool.query(sql)};
 }else{
  const local=new PGlite();engine=local;
  db=createPostgresClient({pool:{query:async(sql:string,values?:unknown[])=>local.query(sql,values),end:()=>local.close()}});
 }
 try{for(const name of readdirSync(migrationDir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort())await engine.exec(readFileSync(new URL(name,migrationDir),'utf8'));}catch(error){await db.close();throw error;}

 return{engine,db};
}
export async function must<T>(query:PromiseLike<{data:T|null;error:any}>):Promise<T>{const result=await query;if(result.error)throw new Error(result.error.message);return result.data as T;}
export async function paperFixture(db:any,side='long'){
 const account=await must<any>(db.from('paper_trading_accounts').insert({name:'fixture',base_currency:'USDT',initial_balance:10000,cash_balance:10000}).select().single());
 const config=await must<any>(db.from('paper_strategy_configs').insert({account_id:account.id,symbol:'BTCUSDT',strategy_version:'test',long_score_min:60,short_score_max:40,confidence_min:60,position_size_percent:10,stop_loss_percent:2,take_profit_percent:4,max_holding_minutes:120,fee_rate_percent:0.04,slippage_percent:0.01,allow_long:true,allow_short:true}).select().single());
 const decision=await must<any>(db.from('final_market_decisions').insert({symbol:'BTCUSDT',decided_at:new Date().toISOString(),direction:side==='long'?'bullish':'bearish',action:side==='long'?'buy':'sell',final_score:side==='long'?75:25,final_confidence:90,trading_permission:'allowed'}).select().single());
 return{account,config,decision};
}
