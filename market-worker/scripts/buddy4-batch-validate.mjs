#!/usr/bin/env node
// Read-only coverage and live-catalog reconciliation. This does not apply migrations.
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=join(root,'migrations/buddy4');
const contract=JSON.parse(readFileSync(join(dir,'schema-contract.json'),'utf8'));
const sql=readdirSync(dir).filter(n=>/^\d+_.*\.sql$/.test(n)).map(n=>readFileSync(join(dir,n),'utf8')).join('\n');
const missingDefinitions=[...contract.tables.map(t=>[t.name,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+t.name+'\\s*\\(','i')]),...contract.views.map(v=>[v,new RegExp('CREATE OR REPLACE VIEW public\\.'+v+'\\s','i')]),...contract.rpcs.map(f=>[f,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+f+'\\s*\\(','i')])].filter(([,pattern])=>!pattern.test(sql)).map(([name])=>name);
const report={tables:contract.tables.length,views:contract.views.length,rpcs:contract.rpcs.length,missingDefinitions,notice:'Code-derived replacement contracts, not original Supabase DDL. Test DB integration and Buddy4 acceptance are separate gates.'};
if(process.argv.includes('--check-db')){
 const query=`SELECT json_build_object('columns',(SELECT coalesce(json_agg(json_build_object('table',table_name,'column',column_name,'type',udt_name)),'[]') FROM information_schema.columns WHERE table_schema='public'),'functions',(SELECT coalesce(json_agg(json_build_object('name',p.proname,'arguments',pg_get_function_arguments(p.oid))),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'),'constraints',(SELECT coalesce(json_agg(json_build_object('table',c.conrelid::regclass::text,'kind',c.contype,'definition',pg_get_constraintdef(c.oid))),'[]') FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'))`;
 const actual=JSON.parse(execFileSync('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','-d',process.env.PGDATABASE||'marketmind','-c',query],{encoding:'utf8'}).trim());
 const columns=new Set(actual.columns.map(c=>c.table+'.'+c.column));
 report.missingColumns=contract.tables.flatMap(t=>Object.keys(t.columns).filter(c=>!columns.has(t.name+'.'+c)).map(c=>t.name+'.'+c));
 report.missingViews=contract.views.filter(v=>!actual.columns.some(c=>c.table===v));
 report.missingFunctions=contract.rpcs.filter(f=>!actual.functions.some(x=>x.name===f));
 report.catalog=actual;
}
console.log(JSON.stringify(report,null,2));
if(missingDefinitions.length||report.missingColumns?.length||report.missingViews?.length||report.missingFunctions?.length)process.exitCode=2;
