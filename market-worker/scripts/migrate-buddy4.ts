import 'dotenv/config';
import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPostgresClient } from '@marketmind/database/postgres';
// Explicit test gate; this command intentionally refuses the running marketmind DB.
const db=createPostgresClient();
const client=await db.pool.connect();
try{
 const {rows:[{name}]}=await client.query('SELECT current_database() AS name');
 if(!/(?:_test|_restore)$/.test(name)||process.env.BUDDY4_TEST_DATABASE!=='1')throw new Error('Refusing migration: use a separate *_test or *_restore database and BUDDY4_TEST_DATABASE=1');
 await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('marketmind-buddy4-migrations'))");
 await client.query('CREATE TABLE IF NOT EXISTS public.buddy4_schema_migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now())');
 const dir=new URL('../migrations/buddy4/',import.meta.url);
 for(const name of readdirSync(dir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort()){
  const sql=readFileSync(new URL(name,dir),'utf8');const hash=createHash('sha256').update(sql).digest('hex');
  const previous=await client.query('SELECT sha256 FROM public.buddy4_schema_migrations WHERE name=$1',[name]);
  if(previous.rows[0]){if(previous.rows[0].sha256!==hash)throw new Error(`Previously applied migration changed: ${name}`);continue;}
  // Apply every file inside the same transaction, stripping only standalone wrappers.
  await client.query(sql.replace(/^\s*(BEGIN|COMMIT);\s*$/gmi,''));
  await client.query('INSERT INTO public.buddy4_schema_migrations(name,sha256) VALUES($1,$2)',[name,hash]);
  console.log(`Applied ${name}`);
 }
 // CREATE IF NOT EXISTS does not establish compatibility of pre-existing tables.
 const contract=JSON.parse(readFileSync(new URL('schema-contract.json',dir),'utf8'));
 for(const table of contract.tables){
  const actual=await client.query('select column_name,udt_name,is_nullable from information_schema.columns where table_schema=$1 and table_name=$2',['public',table.name]);
  const map=new Map(actual.rows.map((r:any)=>[r.column_name,r.udt_name]));
  for(const [column,type] of Object.entries(table.columns)){
   const found=map.get(column);if(!found)throw new Error(`Schema drift: missing ${table.name}.${column}`);
   const expected=type==='bigint'?'int8':type==='boolean'?'bool':type;
   if(found!==expected && !(type==='numeric'&&['int8','int4','float8','numeric'].includes(String(found))))throw new Error(`Schema drift: incompatible ${table.name}.${column}`);
  }
  for(const column of table.notNull){if(actual.rows.find((r:any)=>r.column_name===column)?.is_nullable!=='NO')throw new Error(`Schema drift: ${table.name}.${column} must be NOT NULL`);}
  const constraints=await client.query("select c.contype,array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.ord) AS keys,c.confrelid::regclass::text AS target from pg_constraint c where c.conrelid=$1::regclass",['public.'+table.name]);
  for(const keys of table.unique){if(!constraints.rows.some((c:any)=>['p','u'].includes(c.contype)&&JSON.stringify(c.keys)===JSON.stringify(keys)))throw new Error(`Schema drift: missing UNIQUE ${table.name}(${keys.join(',')})`);}
  if(table.primaryKey.length&&!constraints.rows.some((c:any)=>c.contype==='p'&&JSON.stringify(c.keys)===JSON.stringify(table.primaryKey)))throw new Error(`Schema drift: missing primary key ${table.name}`);
  for(const [column,target] of Object.entries(table.foreignKeys)){if(!constraints.rows.some((c:any)=>c.contype==='f'&&c.keys.length===1&&c.keys[0]===column&&[target,'public.'+target].includes(c.target)))throw new Error(`Schema drift: incompatible FK ${table.name}.${column}`);}
 }
 await client.query('COMMIT');
}catch(error){await client.query('ROLLBACK');throw error;}
finally{client.release();await db.close();}
