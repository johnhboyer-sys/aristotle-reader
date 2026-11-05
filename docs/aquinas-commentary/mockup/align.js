const fs = require('fs'), vm = require('vm');
const d = process.argv[2];
const ctx = {}; vm.createContext(ctx);
for (const f of ['aquinas-data.js', 'round2-data.js']) vm.runInContext(fs.readFileSync(d + '/' + f, 'utf8').replace(/^const /gm, 'var '), ctx);
const ARI = JSON.parse(fs.readFileSync(d + '/aristotle.json', 'utf8'));
const KEYS = ARI.lines.map(l => l[0] + l[1]), GK = Object.fromEntries(ARI.lines.map(l => [l[0] + l[1], l[2]]));
const end = KEYS.indexOf('403a2');
const L = KEYS.slice(0, end + 1);
// Greek sentences
let g = '', at = {}; for (const k of L) { at[k] = g.length; g += GK[k] + ' '; }
const gs = []; let st = 0;
for (const m of g.matchAll(/[.·;;·]\s*/g)) { gs.push([st, m.index + m[0].length]); st = m.index + m[0].length; }
const lineAt = p => { let r = L[0]; for (const k of L) if (at[k] <= p) r = k; return r; };
console.log('Greek sentences:', gs.length);
gs.forEach(([a, b], i) => console.log(' G' + i, lineAt(a), g.slice(a, b).slice(0, 50).trim()));
console.log('Moerbeke sentences:', ctx.MOER.length);
ctx.MOER.forEach((m, i) => console.log(' M' + i, m.r.join('–'), m.t.replace(/<[^>]+>/g, '').slice(0, 60)));
const en = L.map(k => ARI.en[k] || '').join('');
const es = en.split(/(?<=(?<!\b(?:e\.g|i\.e|viz|cf))[.?!][’”)]*)\s*(?=[A-Z‘“(])/);
console.log('Smith sentences:', es.length);
es.forEach((s, i) => console.log(' E' + i, s.slice(0, 60)));
