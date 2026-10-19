import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):e.name.endsWith('.test.ts')?[join(dir,e.name)]:[]);}
let failed=0;const files=walk(join(root,'src')).sort();
for(const file of files){const r=spawnSync(process.execPath,['--import',fileURLToPath(new URL('../node_modules/tsx/dist/loader.mjs',import.meta.url)),file],{cwd:root,encoding:'utf8',timeout:60000});if(r.status!==0){failed++;console.error(file+'\n'+r.stdout+r.stderr);}else console.log('PASS '+file.slice(root.length));}
console.log(`${files.length-failed}/${files.length} engine test files passed`);process.exitCode=failed?1:0;
