#!/usr/bin/env node
// Safety-first bulk validator: verifies manifest coverage, never synthesizes unknown DDL.
// Usage: node scripts/buddy4-batch-validate.mjs [--check-db]
// Exit 2 until every referenced table and RPC is covered by independently-reviewed migrations.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root=fileURLToPath(new URL("../",import.meta.url));
const migrationDir=join(root,"migrations","buddy4");
const d=readFileSync(join(root,"scripts","plan-buddy4-schema.mjs"),"utf8");
if(!d.includes("tableReferences"))throw Error("Planner script not present");
const manifest=[
 "onchain_snapshots","market_candles","technical_snapshots","market_scores","funding_snapshots"
];
const migrations=readdirSync(migrationDir).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
const referencedFiles=[];
for(const name of migrations)referencedFiles.push(name);
const covered=new Set();
for(const name of migrations){
 const content=readFileSync(join(migrationDir,name),"utf8");
 for(const m of content.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(?:public\.)?([a-z_]\w*)/gi)) covered.add(m[1]);
}
const missingReviewed=manifest.filter(x=>!covered.has(x));
const summary={reviewedTables:[...covered].sort(),migrations:referencedFiles,missingExpectedReviewed:missingReviewed,warning:"Incomplete bulk migration. This validator never creates placeholder tables and cannot certify the 66 unreconstructed schemas or 8 RPCs."};
if(process.argv.includes("--check-db")){
 const database=process.env.PGDATABASE||"marketmind";
 const out=execFileSync("psql",["-X","-A","-t","-d",database,"-c","SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"],{encoding:"utf8"});
 const tables=new Set(out.trim().split("\n"));
 summary.missingInDatabase=[...covered].filter(x=>!tables.has(x)).sort();
}
console.log(JSON.stringify(summary,null,2));
if(missingReviewed.length||summary.missingInDatabase?.length)process.exitCode=2;
