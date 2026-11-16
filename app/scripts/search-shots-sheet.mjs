// Builds <dir>/index.html: each search state's build shot (from
// search-shots.mjs) beside its round-34 twin. Copies the twins into <dir>/r34/
// so the sheet stands alone.
//
// usage: node app/scripts/search-shots-sheet.mjs <dir> [--r34 <round-34 search notes dir>]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { STATES, RETIRED } from './search-shots.mjs';

const argv = process.argv.slice(2);
const dir = argv[0] && !argv[0].startsWith('--') ? resolve(argv[0]) : null;
const ri = argv.indexOf('--r34');
const R34 = ri >= 0 ? resolve(argv[ri + 1]) : '/Users/johnboyer/Developer/aristotle-reader/.claude/worktrees/redesign-build/.redesign-shots/notes/d26/search';
if (!dir) { console.error('usage: search-shots-sheet.mjs <dir> [--r34 <dir>]'); process.exit(2); }
if (!existsSync(R34)) { console.error(`round-34 directory not found: ${R34}`); process.exit(2); }

const resPath = join(dir, 'results.json');
const results = existsSync(resPath) ? JSON.parse(readFileSync(resPath, 'utf8')) : {};

// Captions from the round-33 brief (same states; r33 page names map to r34).
const captions = {};
const brief = join(R34, 'menus/m33/BRIEF-M33.md');
if (existsSync(brief)) for (const m of readFileSync(brief, 'utf8').matchAll(/^- ([a-z0-9-]+)\.png: (.+)$/gm)) captions[m[1].replace(/^r33-/, 'r34-')] = m[2];

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
mkdirSync(join(dir, 'r34'), { recursive: true });

let nShot = 0, nFailed = 0, nNotRun = 0, nNoTwin = 0;
const rows = STATES.map(st => {
  const h = st.kind === 'menu' ? st.h : st.clipH;
  const src = join(R34, st.twin), twin = `r34/${basename(st.twin)}`;
  let twinHtml;
  if (existsSync(src)) { copyFileSync(src, join(dir, twin)); twinHtml = `<img src="${twin}" width="${st.w}" alt="">`; }
  else { nNoTwin++; twinHtml = box(st.w, h, 'no round-34 twin'); }
  const runs = Object.values(results).filter(r => r.name === st.name).sort((a, b) => (a.theme !== st.theme) - (b.theme !== st.theme));
  if (!runs.length) nNotRun++;
  const builds = runs.length ? runs.map(r => {
    const tag = r.theme === st.theme ? '' : ` · ${r.theme} (twin is ${st.theme})`;
    if (r.status === 'shot' && r.file && existsSync(join(dir, r.file))) { nShot++; return `<figure><img src="${esc(r.file)}" width="${st.w}" alt=""><figcaption>build${tag} · ${esc(r.at)}</figcaption></figure>`; }
    nFailed++; return `<figure>${box(st.w, h, `FAILED${tag}: ${r.reason || 'no file'}`)}<figcaption>build${tag} · ${esc(r.at)}</figcaption></figure>`;
  }).join('') : `<figure>${box(st.w, h, 'not shot')}<figcaption>build</figcaption></figure>`;
  const failed = runs.some(r => r.status !== 'shot');
  return `<section id="${st.name}" class="${failed ? 'failed' : ''}">
<h2>${st.name} <span>${st.w}×${h} · ${st.theme}</span></h2>${captions[st.name] ? `<p>${esc(captions[st.name])}</p>` : ''}
<div class="pair" style="--w:${st.w}px"><div>${builds}</div><figure>${twinHtml}<figcaption>round 34</figcaption></figure></div>
</section>`;
});

function box(w, h, label) {
  return `<div class="box" style="width:${w}px;aspect-ratio:${w}/${h}">${esc(label)}</div>`;
}

const failedList = STATES.flatMap(st => Object.values(results).filter(r => r.name === st.name && r.status !== 'shot').map(r => `<li><a href="#${st.name}">${st.name}${r.theme === st.theme ? '' : '@' + r.theme}</a> ${esc(r.reason)}</li>`));
const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Search shots</title>
<style>
body { margin: 0; padding: 16px; background: #e8e6e1; color: #222; font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 18px; margin: 0 0 4px; }
section { margin: 28px 0; padding-top: 12px; border-top: 1px solid #bbb; }
section.failed h2 { color: #a01010; }
h2 { font-size: 15px; margin: 0; } h2 span { font-weight: 400; color: #666; margin-left: 8px; }
section > p { margin: 2px 0 8px; color: #444; }
.pair { display: grid; grid-template-columns: repeat(2, minmax(0, var(--w))); gap: 16px; align-items: start; }
figure { margin: 0 0 8px; } figcaption { font-size: 12px; color: #666; }
img, .box { display: block; max-width: 100%; height: auto; outline: 1px solid #999; background: #fff; }
.box { box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 12px; text-align: center; color: #a01010; background: repeating-linear-gradient(45deg, #fff, #fff 8px, #f2f0ec 8px, #f2f0ec 16px); }
ul { margin: 6px 0; padding-left: 20px; } a { color: inherit; }
</style>
<h1>Search page: build beside round 34</h1>
<p>${nShot} shot · ${nFailed} failed · ${nNotRun} not run · skipped ${Object.keys(RETIRED).length} (${Object.keys(RETIRED).join(', ')}, retired)${nNoTwin ? ` · ${nNoTwin} without a twin` : ''}. Left: build, nothing injected. Right: round-34 mock-up.</p>
${failedList.length ? `<details><summary>${failedList.length} failed</summary><ul>${failedList.join('\n')}</ul></details>` : ''}
${rows.join('\n')}
`;
writeFileSync(join(dir, 'index.html'), html);
console.log(`${join(dir, 'index.html')}: ${nShot} shot, ${nFailed} failed, ${nNotRun} not run, ${nNoTwin} without twin`);
