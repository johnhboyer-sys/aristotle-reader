import fs from 'node:fs';
const parse = t => { const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); } return rows; };
const load = n => parse(fs.readFileSync(n, 'utf8').replace(/^﻿/, '')).slice(1).filter(r => r.length >= 8);
const or = load('hits-or.csv'), and = load('hits-and.csv');
console.log('rows or', or.length, 'and', and.length);
const colOf = ref => { const m = /^(\d+[a-z])/.exec(ref); return m ? m[1] : null; };
const odd = new Set();
const chap = new Map(); // key work|book|chapter -> {g:Set cols, e:Map col->Set trans, rows:[]}
for (const [work, book, ch, ref, lang, tr, snip] of or) {
  const col = colOf(ref); if (!col) odd.add(work + ' ' + ref);
  const k = `${work}|${book}|${ch}`; const c = chap.get(k) ?? chap.set(k, { g: new Map(), e: new Map() }).get(k);
  const m = lang === 'Greek' ? c.g : c.e; const key = col ?? ref;
  (m.get(key) ?? m.set(key, []).get(key)).push({ ref, tr, snip: snip.slice(0, 220) });
}
console.log('odd refs', odd.size, [...odd].slice(0, 8));
let G = 0, E = 0, any = 0, piece = 0, both = 0, gOnly = 0, eOnly = 0; const diff = [];
for (const [k, c] of chap) {
  const g = c.g.size > 0, e = c.e.size > 0; G += g; E += e; any++;
  if (g && e) { both++; const shared = [...c.g.keys()].some(col => c.e.has(col)); if (shared) piece++; else diff.push([k, c]); }
  else if (g) gOnly++; else eOnly++;
}
console.log({ chapters_any: any, with_greek: G, with_english: E, and_anywhere_in_chapter: both, and_same_column_piece: piece, greek_only: gOnly, english_only: eOnly });
// chapters in the current AND search
console.log('chapters in current AND', new Set(and.map(r => `${r[0]}|${r[1]}|${r[2]}`)).size, 'columns in current AND', new Set(and.map(r => `${r[0]}|${r[1]}|${colOf(r[3])}`)).size);
fs.writeFileSync('diff.json', JSON.stringify(diff.map(([k, c]) => ({ k, g: [...c.g], e: [...c.e] })), null, 1));
console.log('diff chapters', diff.length); for (const [k, c] of diff.slice(0, 40)) console.log(k, 'G:', [...c.g.keys()].join(' '), '| E:', [...c.e.keys()].join(' '));
const ac = new Map();
for (const [work, book, ch, ref, lang, tr, snip] of and) { const k = `${work}|${book}|${ch}`; const c = ac.get(k) ?? ac.set(k, { g: [], e: [] }).get(k); (lang === 'Greek' ? c.g : c.e).push(lang === 'Greek' ? `${ref} ${snip.slice(0, 120)}` : `${ref} ${tr}: ${snip.slice(0, 160)}`); }
const lop = [...ac].filter(([, c]) => !c.g.length || !c.e.length);
console.log('AND chapters holding one language only', lop.length);
for (const [k, c] of lop.slice(0, 12)) console.log('\n' + k, c.g.length ? 'GREEK ONLY' : 'ENGLISH ONLY', '\n  ', (c.g[0] || c.e[0]));
fs.writeFileSync('lop.json', JSON.stringify(lop, null, 1));
