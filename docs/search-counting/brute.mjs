// Chapters and hits of ἀρετή + virtue, counted from the built books alone:
// no search index, no offsets file, no engine code. Gate R-S7 in
// app/scripts/check-redesign.mjs pins what this prints; rerun it after a
// corpus rebuild.   node docs/search-counting/brute.mjs [build/dist]
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const DIST = process.argv[2] || 'build/dist';
const plain = s => s.toLowerCase().replace(/[^a-z]/g, '');
// English words as the eye splits them: lowercase, curly apostrophes made
// straight, runs of letters and inner apostrophes.
const words = t => (t.toLowerCase().replace(/[‘’]/g, "'").match(/[a-z']+/g) || [])
  .map(w => w.replace(/^'+|'+$/g, '')).filter(Boolean);
// "virtue" in any form: virtue, virtues, virtue's, virtues'.
const isVirtue = w => w === 'virtue' || w === 'virtues' || w === "virtue's" || w === "virtues'";
const grk = new Map(), eng = new Map(), slots = new Map(), bySlot = new Map(), chBySlot = new Map();
// The phrase list (John, 16 Nov: "Three-word runs"): each three-word run that
// holds a virtue word, within a sentence, counted once for each such word in it.
const phrases = new Map(), aside = new Map();
const ASIDE = 'in virtue of';
const runsIn = text => {
  for (const sentence of text.split(/[.;:!?]/)) {
    const w = words(sentence);
    w.forEach((x, i) => {
      if (!isVirtue(x)) return;
      const runs = [];
      for (let a = i - 2; a <= i; a++) if (a >= 0 && a + 2 < w.length) runs.push(w.slice(a, a + 3).join(' '));
      for (const r of runs) {
        bump(phrases, r);
        // With "in virtue of" set aside, a word inside it counts for it alone.
        if (r === ASIDE || !runs.includes(ASIDE)) bump(aside, r);
      }
    });
  }
};
const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
for (const work of readdirSync(DIST).sort()) {
  const dir = join(DIST, work);
  if (!existsSync(join(dir, 'analyses.json'))) continue;
  const analyses = JSON.parse(readFileSync(join(dir, 'analyses.json'), 'utf8'));
  const areth = k => (analyses[k] || []).some(a => plain(a.lemma) === 'areth');
  for (const f of readdirSync(dir).filter(f => /^book-\d+\.json$/.test(f)).sort()) {
    const book = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const key = c => `${work}:${book.book}:${c}`;
    const first = book.segments.flatMap(s => s.chapterStarts || [])[0]?.chapter;
    let ch = first;   // words before a book's first chapter start go with it
    for (const seg of book.segments) {
      const starts = seg.chapterStarts || [];
      const atHead = ch;
      // The Greek: a chapter begins before its line, at its word in the line.
      for (const line of seg.greek) {
        const s = starts.find(c => c.beforeLine === line.n);
        line.tokens.forEach((t, i) => {
          if (s && i === s.wordIndex) ch = s.chapter;
          if (areth(t.k)) bump(grk, key(ch));
        });
      }
      const add = (c, slot, n) => { if (n) { bump(eng, key(c), n); bump(bySlot, `${work}|${slot}`, n); (chBySlot.get(`${work}|${slot}`) ?? chBySlot.set(`${work}|${slot}`, new Set()).get(`${work}|${slot}`)).add(key(c)); (slots.get(key(c)) ?? slots.set(key(c), new Set()).get(key(c))).add(slot); } };
      // The main translation: a chapter begins at its engOffset.
      if (seg.english?.text) {
        const text = seg.english.text;
        let from = 0, cur = atHead;
        for (const c of [...starts].sort((a, b) => a.engOffset - b.engOffset)) {
          add(cur, 'main', words(text.slice(from, c.engOffset)).filter(isVirtue).length);
          from = c.engOffset; cur = c.chapter;
        }
        add(cur, 'main', words(text.slice(from)).filter(isVirtue).length);
        runsIn(text);
      }
      // The others: each piece names its chapter.
      const others = { secondary: seg.secondary || seg.ross, third: seg.third };
      for (const [id, v] of Object.entries(seg.overlays || {})) others['overlay-' + id] = v;
      for (const [slot, pieces] of Object.entries(others)) {
        for (const p of pieces || []) add(p.chapter, slot, words(p.text || '').filter(isVirtue).length);
        runsIn((pieces || []).map(p => p.text || '').join(' '));
      }
    }
  }
}
const G = new Set(grk.keys()), E = new Set(eng.keys());
const both = [...G].filter(k => E.has(k));
const sum = (m, ks) => ks.reduce((n, k) => n + (m.get(k) || 0), 0);
console.log(JSON.stringify({
  'ἀρετή or virtue: chapters': new Set([...G, ...E]).size,
  'both': both.length, 'Greek only': G.size - both.length, 'English only': E.size - both.length,
  'Greek hits, both chapters': sum(grk, both), 'Greek hits, all': sum(grk, [...G]),
  'Greek hits, Greek-only chapters': sum(grk, [...G].filter(k => !E.has(k))),
  'English hits, all translations': sum(eng, [...E]),
  'virtue: chapters': E.size,
  // The nested list (John, 16 Nov): EN's chapters with virtue in any translation, and each slot's hits.
  'virtue: EN chapters': [...E].filter(k => k.startsWith('EN:')).length,
  'virtue: EN chapters by slot': Object.fromEntries([...chBySlot].filter(([k]) => k.startsWith('EN|')).map(([k, v]) => [k.slice(3), v.size])),
  'virtue: phrases, top 12': Object.fromEntries([...phrases].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12)),
  'virtue: phrases, top 12, "in virtue of" set aside': Object.fromEntries([...phrases].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([p]) => [p, aside.get(p) || 0])),
  'virtue: EN hits by slot': Object.fromEntries([...bySlot].filter(([k]) => k.startsWith('EN|')).map(([k, n]) => [k.slice(3), n])), 'virtue: chapters with more than one translation': [...slots.values()].filter(s => s.size > 1).length,
}, null, 1));
