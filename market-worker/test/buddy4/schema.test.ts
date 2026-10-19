import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import {testDatabase,migrationDir,must} from './helpers';

test('all source contracts, FK/UNIQUE, views and RPCs migrate and reapply without deleting data',async()=>{
 const{engine,db}=await testDatabase();
 try{
 const contract=JSON.parse(readFileSync(new URL('schema-contract.json',migrationDir),'utf8'));
 for(const t of contract.tables){
  const columns=(await engine.query<{column_name:string}>('select column_name from information_schema.columns where table_schema=$1 and table_name=$2',['public',t.name])).rows.map(r=>r.column_name);
  for(const column of Object.keys(t.columns))assert.ok(columns.includes(column),`${t.name}.${column}`);
  for(const keys of t.unique){
   const result=await engine.query<{keys:string[]}>('select array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.ord) AS keys from pg_constraint c where c.conrelid=$1::regclass and c.contype in(\'p\',\'u\')',[`public.${t.name}`]);
   assert.ok(result.rows.some(r=>JSON.stringify(r.keys)===JSON.stringify(keys)),`unique ${t.name}.${keys}`);
  }
  for(const column of Object.keys(t.foreignKeys))assert.ok((await engine.query('select 1 from pg_constraint where conrelid=$1::regclass and contype=\'f\' and conkey=ARRAY[(select attnum from pg_attribute where attrelid=$1::regclass and attname=$2)]',[`public.${t.name}`,column])).rows.length,`FK ${t.name}.${column}`);
 }
 for(const name of contract.views)assert.ok((await engine.query('select 1 from pg_views where schemaname=\'public\' and viewname=$1',[name])).rows.length,name);
 for(const name of contract.rpcs)assert.ok((await engine.query('select 1 from pg_proc where pronamespace=\'public\'::regnamespace and proname=$1',[name])).rows.length,name);
 await must(db.from('market_context_snapshots').insert({symbol:'BTCUSDT',context_score:72}));
 for(const file of readdirSync(migrationDir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort())await engine.exec(readFileSync(new URL(file,migrationDir),'utf8'));
 assert.equal(Number((await must<any[]>(db.from('market_context_snapshots').select()))[0].context_score),72);
 }finally{await db.close();}
});

test('source readers/writers are covered by the explicit schema, rather than table names alone',()=>{
 const contract=JSON.parse(readFileSync(new URL('schema-contract.json',migrationDir),'utf8'));
 const source=JSON.parse(readFileSync(new URL('source-contracts.json',migrationDir),'utf8'));
 const tables=new Map<string,Record<string,string>>(contract.tables.map((t:any)=>[t.name,t.columns]));
 for(const [table,columns] of Object.entries(source.reads) as [string,string[]][]){
  if(contract.views.includes(table))continue;
  for(const column of columns)assert.ok(tables.get(table)?.[column],`${table}.${column}`);
 }
 for(const [table,columns] of Object.entries(source.tables) as [string,Record<string,string>][])
  for(const column of Object.keys(columns))assert.ok(tables.get(table)?.[column],`${table}.${column}`);
});
