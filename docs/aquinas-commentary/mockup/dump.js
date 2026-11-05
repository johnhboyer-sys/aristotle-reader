const fs = require('fs'), vm = require('vm');
const d = process.argv[2];
const ctx = {}; vm.createContext(ctx);
for (const f of ['aquinas-data.js', 'round2-data.js']) vm.runInContext(fs.readFileSync(d + '/' + f, 'utf8').replace(/^const /gm, 'var '), ctx);
const ARI = JSON.parse(fs.readFileSync(d + '/aristotle.json', 'utf8'));
const KEYS = ARI.lines.map(l => l[0] + l[1]);
const L = KEYS.slice(0, KEYS.indexOf('403a2') + 1);
console.log('== GREEK');
for (const l of ARI.lines) { const k = l[0] + l[1]; if (L.includes(k)) console.log(k, l[2]); }
console.log('== SMITH');
console.log(L.map(k => ARI.en[k] || '').join(''));
console.log('== MOERBEKE');
ctx.MOER.forEach((m, i) => console.log('M' + i, m.r.join('–'), m.t.replace(/<[^>]+>/g, '')));
