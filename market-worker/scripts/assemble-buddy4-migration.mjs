import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
const dir=new URL('../migrations/buddy4/',import.meta.url);
const files=readdirSync(dir).filter(n=>/^\d+_.*\.sql$/.test(n)).sort();
const contract=JSON.parse(readFileSync(new URL('schema-contract.json',dir),'utf8'));
let sql=`-- Integrated Buddy4 replacement schema. Generated; edit numbered migrations instead.\n-- Test database only. Original Supabase catalog unavailable; see SCHEMA-DECISIONS.md.\nBEGIN;\nSET LOCAL lock_timeout='5s';\nDO $$ BEGIN IF current_database() !~ '(_test|_restore)$' THEN RAISE EXCEPTION 'Use a disposable *_test or *_restore database first'; END IF; END $$;\nSELECT pg_advisory_xact_lock(hashtext('marketmind-buddy4-migrations'));\n`;
for(const file of files)sql+=`\n-- ${file}\n`+readFileSync(new URL(file,dir),'utf8').replace(/^\s*(BEGIN|COMMIT);\s*$/gmi,'')+'\n';
// Missing columns must roll back the entire batch instead of masquerading as success.
const pairs=contract.tables.flatMap(t=>Object.keys(t.columns).map(c=>`('${t.name}','${c}')`));
sql+=`\nDO $drift$ DECLARE missing text; BEGIN\n SELECT string_agg(r.t||'.'||r.c,', ') INTO missing FROM (VALUES\n${pairs.join(',\n')}\n) r(t,c) WHERE NOT EXISTS(SELECT 1 FROM information_schema.columns a WHERE a.table_schema='public' AND a.table_name=r.t AND a.column_name=r.c);\n IF missing IS NOT NULL THEN RAISE EXCEPTION 'Schema drift; missing columns: %',missing; END IF;\nEND $drift$;\nCOMMIT;\n`;
writeFileSync(new URL('FULL_TEST_SCHEMA.sql',dir),sql);
console.log(`Assembled ${files.length} migrations, ${contract.tables.length} tables, ${contract.views.length} views, ${contract.rpcs.length} RPCs`);
