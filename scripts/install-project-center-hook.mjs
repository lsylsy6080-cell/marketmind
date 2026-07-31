import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const hookDir = path.join(root,'.git','hooks');
if(!fs.existsSync(hookDir)){console.error('Git 저장소 루트에서 실행해 주세요.');process.exit(1)}
const hook = path.join(hookDir,'post-commit');
const body = `#!/bin/sh\nnode scripts/generate-project-center.mjs\ngit add marketmind-project-center-v5.html project-status.json 2>/dev/null || true\n`;
fs.writeFileSync(hook, body, {mode:0o755});
console.log('post-commit hook installed:', hook);
