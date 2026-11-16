import fs from 'node:fs';
const parse = t => { const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; } else f += c; }
  return rows; };
const rows = parse(fs.readFileSync('hits-or.csv', 'utf8').replace(/^﻿/, '')).slice(1).filter(r => r.length >= 8);
const eng = rows.filter(r => r[4] === 'English');
const all = /\bvirtu\w*/gi, idiom = /\b(?:in|by)\s+virtue\s+of\b/gi;
let tot = 0, id = 0; const before = new Map();
for (const r of eng) { const s = r[6]; tot += (s.match(all) || []).length; id += (s.match(idiom) || []).length;
  for (const m of s.matchAll(/(\b\w+\s+)?virtu\w*(\s+\w+)?/gi)) { const k = m[0].toLowerCase(); before.set(k, (before.get(k) || 0) + 1); } }
console.log('english rows', eng.length, 'virtue words in snippets', tot, 'in/by virtue of', id);
console.log([...before].sort((a, b) => b[1] - a[1]).slice(0, 15));
// English-only chapters whose every virtue-word is the idiom
const ch = new Map();
for (const r of rows) { const k = r.slice(0, 3).join('|'); const c = ch.get(k) ?? ch.set(k, { g: 0, all: 0, id: 0 }).get(k);
  if (r[4] === 'Greek') c.g++; else { c.all += (r[6].match(all) || []).length; c.id += (r[6].match(idiom) || []).length; } }
const eo = [...ch.values()].filter(c => !c.g);
console.log('english-only chapters', eo.length, 'all idiom', eo.filter(c => c.all && c.all === c.id).length);
