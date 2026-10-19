#!/usr/bin/env node
/**
 * Batch schema reconstruction inventory. Read-only: NEVER executes or emits deployable DDL.
 * Inspects worker and web TypeScript files and reports sources, select references,
 * known upsert keys, RPC names and write payload patterns for manual reconciliation.
 * Usage: node scripts/plan-buddy4-schema.mjs > ~/buddy4-schema-plan.json
 */
import { readdirSync, readFileSync } from "node:fs";
import { join,relative,extname } from "node:path";
import { fileURLToPath } from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const files=[];
const ignored=new Set(["node_modules",".git",".next","dist","build"]);
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(ignored.has(entry.name))continue;const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if([".ts",".tsx",".js",".mjs"].includes(extname(path)))files.push(path)}}
for(const dir of ["market-worker/src","market-worker/scripts","marketmind-ai/app","marketmind-ai/lib","marketmind-ai/components","marketmind-ai/dashboard"]){try{walk(join(root,dir))}catch{}}
const tables=new Map(),rpcs=new Map();
function record(map,key,file){let r=map.get(key);if(!r){r={name:key,files:new Set(),columns:new Set(),conflictKeys:new Set(),operations:new Set(),dynamicWrites:[],unknowns:[]};map.set(key,r)}r.files.add(file);return r}
for(const file of files){
 const content=readFileSync(file,"utf8");const rel=relative(root,file);
 const accesses=[...content.matchAll(/\.from\s*\(\s*["']([A-Za-z_]\w*)["']\s*\)/g)];
 for(let i=0;i<accesses.length;i++){
  const m=accesses[i],item=record(tables,m[1],rel),fragment=content.slice(m.index,Math.min(content.length,m.index+6500,accesses[i+1]?.index??Infinity));
  for(const op of ["select","insert","update","upsert","delete"])if(new RegExp("\\."+op+"\\s*\\(").test(fragment))item.operations.add(op);
  for(const match of fragment.matchAll(/\.select\s*\(\s*["'\x60]([^"'\x60]+)["'\x60]/g)){
   for(const col of match[1].split(",")){const s=col.trim();if(/^[A-Za-z_]\w*$/.test(s))item.columns.add(s)}
  }
  for(const match of fragment.matchAll(/onConflict\s*:\s*["'\x60]([\w,\s]+)["'\x60]/g)){
   item.conflictKeys.add(match[1].replace(/\s/g,""));
   for(const col of match[1].split(","))item.columns.add(col.trim());
  }
  for(const match of fragment.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|order|is|in)\s*\(\s*["']([A-Za-z_]\w*)["']/g))item.columns.add(match[1]);
  // Only literal inline object keys; computed spreads/variables are unknown and flagged.
  for(const write of fragment.matchAll(/\.(insert|upsert|update)\s*\(\s*(\{[\s\S]{0,2500}?\}|[A-Za-z_$][\w$]*)/g)){
   if(write[2].startsWith("{")){
    // Low-confidence heuristic; nested object keys can pollute, so never treat as DDL.
    for(const key of write[2].matchAll(/(?:^|[,{]\s*)([A-Za-z_]\w*)\s*:/g))item.columns.add(key[1]);
    item.unknowns.push("Nested/spread object types require manual writer inspection");
   }else item.dynamicWrites.push(write[2]);
  }
 }
 for(const m of content.matchAll(/\.rpc\s*\(\s*["']([A-Za-z_]\w*)["']/g))record(rpcs,m[1],rel);
}
const contract=JSON.parse(readFileSync(join(root,"market-worker/migrations/buddy4/schema-contract.json"),"utf8"));
const known=new Set([...contract.tables.map(t=>t.name),...contract.views,...contract.rpcs]);
function normalize(r){return [...r.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>({name:x.name,existingMigration:known.has(x.name),sourceFiles:[...x.files].sort(),candidateColumns:[...x.columns].sort(),upsertConflictKeys:[...x.conflictKeys].sort(),operations:[...x.operations].sort(),dynamicWriteVariables:[...new Set(x.dynamicWrites)].sort(),requiresManualReview:true}))}
const list=normalize(tables);
console.log(JSON.stringify({warning:"PLANNING REPORT ONLY. Candidate columns are heuristics and may contain nested keys or miss .select([...].join()), spread/dynamic payloads and RPC side effects. DO NOT auto-generate production SQL from this report.",sourceFilesScanned:files.length,tableReferences:list.length,notYetMigrated:list.filter(x=>!x.existingMigration).length,tables:list,rpcs:normalize(rpcs)},null,2));
