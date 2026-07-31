import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = process.cwd();
const statusPath = path.join(root, 'project-status.json');
const outputPath = path.join(root, 'marketmind-project-center-v5.html');
const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));

let commits = [];
try {
  const raw = execSync('git log -80 --date=short --pretty=format:%ad%x09%s', { encoding: 'utf8' });
  commits = raw.split('\n').filter(Boolean).map(line => {
    const [date, ...rest] = line.split('\t');
    return { date, subject: rest.join('\t') };
  });
} catch {
  commits = [];
}

const taskMap = new Map(status.tasks.map(t => [t.id, t]));
for (const commit of [...commits].reverse()) {
  for (const type of ['done', 'doing', 'next']) {
    const re = new RegExp(`\\[${type}:([a-z0-9-]+)\\]`, 'gi');
    let match;
    while ((match = re.exec(commit.subject))) {
      const task = taskMap.get(match[1]);
      if (task) task.status = type;
    }
  }
}

const autoTimeline = commits.slice(0, 12).map(c => ({ date: c.date, title: c.subject }));
const timeline = autoTimeline.length ? autoTimeline : status.timeline;
const counts = status.tasks.reduce((a,t)=>(a[t.status]=(a[t.status]||0)+1,a),{});
const weighted = status.areas.reduce((s,a)=>s+a.progress,0) / Math.max(status.areas.length,1);
const nextTask = status.tasks.find(t=>t.status==='next') || status.tasks.find(t=>t.status==='doing') || status.tasks.find(t=>t.status==='todo');

const esc = s => String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const badge = s => ({done:'완료',doing:'진행 중',next:'다음 작업',todo:'예정'}[s]||s);
const cls = s => ({done:'done',doing:'doing',next:'next',todo:'todo'}[s]||'todo');

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(status.project)} 프로젝트 센터 V5</title><style>
:root{--bg:#07111f;--panel:#0d1b2e;--line:#223a58;--text:#edf6ff;--muted:#9fb3c8;--accent:#35b8ff;--done:#31d07d;--doing:#ffc857;--next:#ff8f5a;--todo:#75869a}*{box-sizing:border-box}body{margin:0;font-family:system-ui,"Noto Sans KR",sans-serif;background:radial-gradient(circle at 15% 0%,rgba(53,184,255,.14),transparent 34%),var(--bg);color:var(--text)}.shell{max-width:1480px;margin:auto;padding:26px}.grid{display:grid;grid-template-columns:1.1fr 1.4fr 1fr;gap:16px}.card{background:linear-gradient(180deg,#10233bf5,#0b192bf5);border:1px solid var(--line);border-radius:18px;padding:20px;margin-bottom:16px}.hero{display:grid;grid-template-columns:1.5fr .8fr;gap:16px}.eyebrow{color:var(--accent);font-weight:800;letter-spacing:.12em;font-size:12px}h1{font-size:44px;margin:8px 0}h2{font-size:18px;margin:0 0 14px}.muted{color:var(--muted)}.score{font-size:48px;font-weight:900}.bar{height:10px;background:#06101c;border:1px solid var(--line);border-radius:99px;overflow:hidden}.fill{height:100%;background:linear-gradient(90deg,var(--accent),#70dcff)}.area,.task,.timeline{padding:11px 0;border-bottom:1px solid var(--line)}.row{display:flex;justify-content:space-between;gap:12px;align-items:center}.tag{font-size:11px;font-weight:800;padding:5px 8px;border-radius:99px}.tag.done{background:var(--done);color:#06160e}.tag.doing{background:var(--doing);color:#211800}.tag.next{background:var(--next);color:#241006}.tag.todo{background:var(--todo)}.nextbox{border:1px solid #ff8f5a88;background:#ff8f5a10;border-radius:14px;padding:16px}.timeline small{color:var(--accent)}code{color:#9ee8ff}pre{white-space:pre-wrap;color:#cfe8ff;font-size:12px}.footer{text-align:center;color:var(--muted);font-size:12px;padding:12px}@media(max-width:1050px){.grid{grid-template-columns:1fr 1fr}.hero{grid-template-columns:1fr}}@media(max-width:700px){.grid,.hero{grid-template-columns:1fr}.shell{padding:12px}h1{font-size:34px}}
</style></head><body><main class="shell"><section class="hero"><div class="card"><div class="eyebrow">MARKETMIND AI · PROJECT OPERATIONS CENTER</div><h1>프로젝트 센터 V5</h1><p class="muted">${esc(status.summary)}</p><div class="row"><span>버전 <b>${esc(status.version)}</b></span><span>갱신 <b>${esc(status.updatedAt)}</b></span></div></div><div class="card"><div class="muted">전체 완성도</div><div class="score">${Math.round(weighted)}%</div><div class="bar"><div class="fill" style="width:${weighted}%"></div></div><p class="muted">완료 ${counts.done||0} · 진행 ${counts.doing||0} · 예정 ${counts.todo||0}</p></div></section>
<div class="grid"><div><section class="card"><h2>영역별 진행률</h2>${status.areas.map(a=>`<div class="area"><div class="row"><span>${esc(a.name)}</span><b>${a.progress}%</b></div><div class="bar"><div class="fill" style="width:${a.progress}%"></div></div></div>`).join('')}</section><section class="card"><h2>다음 작업</h2><div class="nextbox"><div class="muted">최우선 추천</div><h2>${esc(nextTask?.name||'미정')}</h2><div>${esc(nextTask?.area||'')}</div><p class="muted">완료 커밋에 <code>[done:${esc(nextTask?.id||'task-id')}]</code>를 넣으면 자동 반영됩니다.</p></div></section></div>
<div><section class="card"><h2>기능 관리표</h2>${status.tasks.map(t=>`<div class="task row"><div><b>${esc(t.name)}</b><div class="muted">${esc(t.area)} · 우선순위 ${esc(t.priority)}</div></div><span class="tag ${cls(t.status)}">${badge(t.status)}</span></div>`).join('')}</section></div>
<div><section class="card"><h2>최근 Git 타임라인</h2>${timeline.map(t=>`<div class="timeline"><small>${esc(t.date)}</small><div>${esc(t.title)}</div></div>`).join('')}</section><section class="card"><h2>자동 기록 규칙</h2><pre>git commit -m "feat: AI Decision Engine 완료 [done:decision-engine]"

git commit -m "chore: Paper Trading 작업 시작 [doing:paper-trading]"</pre><p class="muted">post-commit 훅을 설치하면 커밋 직후 이 HTML이 자동 재생성됩니다.</p></section></div></div><div class="footer">MarketMind AI · project-status.json + Git commit 기반 자동 관제센터</div></main></body></html>`;
fs.writeFileSync(outputPath, html, 'utf8');
console.log(`Generated: ${outputPath}`);
