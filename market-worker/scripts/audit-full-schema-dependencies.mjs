#!/usr/bin/env node
// Read-only inventory of table-specific select fields and upsert conflict keys.
// Generates a migration planning report, NOT guessed CREATE TABLE statements.
import {readdirSync,readFileSync} from "node:fs";
import {join,relative,extname} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const found=new Map();
const fileNames=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){if(["node_modules",".git",".next","dist"].includes(entry.name))continue;const p=join(dir,entry.name);if(entry.isDirectory())walk(p);else if([".ts",".tsx",".js",".mjs"].includes(extname(p)))fileNames.push(p)}}
for(const sub of ["market-worker/src","market-worker/scripts","marketmind-ai/app","marketmind-ai/lib"]) {try{walk(join(root,sub))}catch{}}
for(const file of fileNames){
 const src=readFileSync(file,"utf8");
 const ref=relative(root,file);
 const matches=[...src.matchAll(/\.from\s*\(\s*["']([A-Za-z_][\w]*)["']\s*\)/g)];
 for(let i=0;i<matches.length;i++){
  const match=matches[i];const name=match[1];const end=matches[i+1]?.index??src.length;
  const window=src.slice(match.index,Math.min(end,match.index+3500));
  if(!found.has(name))found.set(name,{table:name,files:new Set(),selected:new Set(),conflictKeys:new Set(),methods:new Set()});
  const entry=found.get(name);entry.files.add(ref);
  for(const m of window.matchAll(/\.select\s*\(\s*["'`]([\w,*\s]+)["'`]/g))for(const col of m[1].split(",").map(x=>x.trim()))if(col && col!=="*")entry.selected.add(col);
  for(const m of window.matchAll(/onConflict\s*:\s*["'`]([\w,\s]+)["'`]/g))entry.conflictKeys.add(m[1].replace(/\s/g,""));
  for(const method of ["insert","upsert","update","delete","select"])if(new RegExp("\\."+method+"\\s*\\(").test(window))entry.methods.add(method);
 }
}
const tables=[...found.values()].sort((a,b)=>a.table.localeCompare(b.table)).map(x=>({table:x.table,files:[...x.files].sort(),selectedColumns:[...x.selected].sort(),onConflict:[...x.conflictKeys].sort(),methods:[...x.methods].sort()}));
console.log(JSON.stringify({notice:"Static source-derived hints only. Inspect writers for required columns, defaults, types, RPC signatures and constraints before applying any DDL.",filesScanned:fileNames.length,tables},null,2));
