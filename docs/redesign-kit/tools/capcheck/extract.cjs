// Pull every caption from B and H into one list for checking.
// usage: node extract.cjs <kit dir> <out.json>
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const [kit, out] = process.argv.slice(2);
const rows = [];
// H: the plate tables, evaluated with the constants they use.
const h = fs.readFileSync(path.join(kit, 'dirs/h/script.js'), 'utf8');
const lines = h.split('\n');
const grab = (start) => { const i = lines.findIndex((l) => l.startsWith(start)); let j = i; while (!/^  };/.test(lines[j])) j++; return lines.slice(i, j + 1).join('\n'); };
const consts = lines.filter((l) => /^  const [A-Z_]+ = ('|\(lib\))/.test(l)).join('\n');
const src = `${consts}\n${grab('  const PL = {')}\n${grab('  const PL_LATER = {')}\n({ PL, PL_LATER })`;
const { PL, PL_LATER } = vm.runInNewContext(src, {});
for (const [set, table] of [['early', PL], ['later', PL_LATER]]) {
  for (const [id, p] of Object.entries(table)) {
    if (!p.q && !p.note && !p.c) continue;
    rows.push({ dir: 'H', set, work: id, quote: p.q || '', cite: p.c || '', translator: p.t || '', note: p.note || '', picture: [p.who, p.what, p.when].filter(Boolean).join(', ') });
  }
}
// B: the Getty photographs' captions (window.DATA.photos) and the blackboards.
const shell = fs.readFileSync(path.join(kit, 'shell.html'), 'utf8');
const i = shell.indexOf('window.DATA = ') + 'window.DATA = '.length;
const D = JSON.parse(shell.slice(i, shell.indexOf('\n', i)).trim().replace(/;$/, ''));
for (const [id, p] of Object.entries(D.photos)) rows.push({ dir: 'B', set: 'getty', work: id, caption: p.cap, picture: [p.title, p.maker, p.date].join(', ') });
const b = fs.readFileSync(path.join(kit, 'dirs/b/script.js'), 'utf8');
const cb = b.slice(b.indexOf('  const CHALK = {'), b.indexOf('  };\n', b.indexOf('  const CHALK = {')) + 5);
const CHALK = vm.runInNewContext(cb.replace('const CHALK =', 'CHALK =') + '\nCHALK', {});
for (const [id, p] of Object.entries(CHALK)) rows.push({ dir: 'B', set: 'chalk', work: id, caption: p.cap, picture: [p.title, p.maker, p.date].join(', ') });
fs.writeFileSync(out, JSON.stringify(rows, null, 1));
const by = rows.reduce((m, r) => ((m[`${r.dir}/${r.set}`] = (m[`${r.dir}/${r.set}`] || 0) + 1), m), {});
console.log(rows.length, 'captions', JSON.stringify(by));
