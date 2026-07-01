// Build-time concordance pass: the "lemma pages" spike.
//
// Walks every built work under public/data/<work>/ (analyses.json + book-NN.json),
// resolves each Greek token to its primary lemma, and accumulates a corpus-wide
// concordance: per lemma, a total frequency, a per-work breakdown, and a capped
// sample of occurrences (work, book, Bekker citation, and the line for KWIC).
//
// Emits, under public/data/lemmata/:
//   <slug>.json   — one file per top-N lemma (the page's data)
//   _index.json   — [{ slug, key }]  (drives the Astro getStaticPaths)
// and public/data/lemmata.json — the popup manifest { lsjKey: {slug, head, count} }
// so the in-reader word popup can show "appears N×" and link, only for lemmata
// that actually have a page. The build is the single source of truth for slugs.
//
// This is a spike: top-N lemmata only, occurrences capped, Bonitz layer stubbed.
// Run: node scripts/build-lemmata.mjs   (from app/)

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DATA = 'public/data';
const OUT = join(DATA, 'lemmata');
// Emit a page for every lemma appearing at least MIN_COUNT times. (Hapax and
// count-2 lemmata make thin pages, so they're held back until the corpus has
// more authority; drop MIN_COUNT to 1 to emit the entire vocabulary.)
const MIN_COUNT = 3;
const INSTANCE_CAP = 3000;    // max complete Bekker-citation instances stored per lemma

// ── Beta Code → readable ASCII slug ─────────────────────────────────────────
// Beta Code is already a Latin transliteration with punctuation for accents and
// breathings; we map the letters to conventional romanization (h→e, w→o, q→th,
// c→x, u→y, f→ph, x→ch, y→ps) and lift an initial rough breathing to a leading
// 'h'. Deterministic; collisions are suffixed by the caller.
const LAT = { a:'a', b:'b', g:'g', d:'d', e:'e', z:'z', h:'e', q:'th', i:'i',
  k:'k', l:'l', m:'m', n:'n', c:'x', o:'o', p:'p', r:'r', s:'s', t:'t', u:'y',
  f:'ph', x:'ch', y:'ps', w:'o' };
function slugify(beta) {
  const s0 = beta.toLowerCase().replace(/[^a-z(]/g, '');  // keep letters + rough mark
  const pi = s0.indexOf('(');
  const rough = pi >= 0 && pi <= 2;                        // breathing on initial vowel/diphthong
  const s = s0.replace(/\(/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    // Upsilon is 'y' alone (dynamis, psyche) but 'u' in the diphthongs ου/αυ/ευ.
    if (s[i] === 'u' && 'aeo'.includes(s[i - 1])) { out += 'u'; continue; }
    out += (LAT[s[i]] ?? '');
  }
  if (rough) out = 'h' + out;
  return out || 'x';
}

// ── Stopwords ───────────────────────────────────────────────────────────────
// Closed-class function words (articles, conjunctions, particles, pronouns,
// negations) make near-worthless lexicon pages and thin-content SEO liabilities.
// We still COUNT them (frequency totals stay honest) but never emit a page.
// Conjunctions/particles are caught by parse; the rest by lemma beta.
const STOP_PARSE = /\((?:conj|particle)\)/;
const STOP_LEMMA = new Set([
  'o(',       // ὁ  the (article)
  'ou(=tos',  // οὗτος this
  'au)to/s',  // αὐτός self
  'o(/s',     // ὅς who/which (relative)
  'ti/s', 'tis',   // τίς/τις who/some
  'e)gw/', 'su/', 'e(autou=',   // I / you / -self
  'ou)', 'mh/',    // οὐ / μή  not
  'ei)',      // εἰ  if
  'w(s',      // ὡς  as
  'o(/de',    // ὅδε this
]);
const isStop = (b) => STOP_LEMMA.has(b.lemmaBeta) || STOP_PARSE.test(b.parse);

// Some source glosses carry embedded TEI markup (e.g. `to be <foreign
// lang="greek">ἄδικος,</foreign>`). Strip tags, collapse whitespace, and trim
// trailing punctuation so the gloss reads as plain text.
const cleanGloss = (s) =>
  s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').replace(/[;,\s]+$/, '').trim();

// ── Enumerate built works ───────────────────────────────────────────────────
const works = readdirSync(DATA, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== 'lsj' && d.name !== 'lemmata')
  .map((d) => d.name)
  .filter((w) => existsSync(join(DATA, w, 'analyses.json')));

// Titles + a stable display order from each work's manifest.
const title = {};
for (const w of works) {
  try { title[w] = JSON.parse(readFileSync(join(DATA, w, 'manifest.json'), 'utf8')).work.title; }
  catch { title[w] = w; }
}
const workOrder = [...works].sort((a, b) => title[a].localeCompare(title[b]));
const orderIdx = Object.fromEntries(workOrder.map((w, i) => [w, i]));

// ── Chapter resolution ──────────────────────────────────────────────────────
// A raw Bekker citation means nothing without book/chapter, so we resolve every
// instance to its chapter using each work's chapters.json (per book, the start
// column:line of each chapter). A position is ordered by (page, a/b, line).
const posOf = (col, line) => {
  const m = /^(\d+)([ab])$/.exec(col);
  if (!m) return 0;
  return (Number(m[1]) * 2 + (m[2] === 'b' ? 1 : 0)) * 100000 + Number(line);
};
const _chapters = new Map();
function chaptersFor(work) {
  if (!_chapters.has(work)) {
    let raw = {};
    try { raw = JSON.parse(readFileSync(join(DATA, work, 'chapters.json'), 'utf8')); } catch { /* none */ }
    const byBook = {};
    for (const [book, list] of Object.entries(raw)) {
      byBook[book] = list
        .map((c, i) => ({ chapter: c.chapter, bekker: c.bekker, pos: posOf(c.column, Number(c.line)), order: i }))
        .sort((a, b) => a.pos - b.pos);
    }
    _chapters.set(work, byBook);
  }
  return _chapters.get(work);
}
// The chapter a (book, col, line) falls in: the last chapter whose start ≤ it.
function resolveChapter(work, book, col, line) {
  const starts = chaptersFor(work)[String(book)] ?? [];
  const p = posOf(col, line);
  let cur = starts[0] ?? null;
  for (const s of starts) { if (s.pos <= p) cur = s; else break; }
  return cur;   // { chapter, bekker, order } | null
}

// ── LSJ head lookup (shared shards) ─────────────────────────────────────────
const _shard = new Map();
function lsjShardLetter(key) {
  for (const ch of key) { if (ch === '*') continue; if (/[a-z]/.test(ch)) return ch; }
  return '_';
}
function lsjHead(key) {
  const letter = lsjShardLetter(key);
  if (!_shard.has(letter)) {
    const p = join(DATA, 'lsj', `${letter}.json`);
    _shard.set(letter, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
  }
  return _shard.get(letter)[key]?.head ?? null;
}

// ── Accumulate the concordance ──────────────────────────────────────────────
// key = primary analysis's lsj[0] (else its lemma beta). One bucket per lemma.
const lemmata = new Map();
function bucket(key) {
  let b = lemmata.get(key);
  if (!b) { b = { key, count: 0, byWork: {}, glosses: new Map(), lemmaBeta: '', parse: '', inst: {}, instN: 0 }; lemmata.set(key, b); }
  return b;
}

let tokenTotal = 0;
for (const w of works) {
  const analyses = JSON.parse(readFileSync(join(DATA, w, 'analyses.json'), 'utf8'));
  const books = readdirSync(join(DATA, w)).filter((f) => /^book-\d+\.json$/.test(f)).sort();
  for (const bf of books) {
    const { book, segments } = JSON.parse(readFileSync(join(DATA, w, bf), 'utf8'));
    for (const seg of segments) {
      for (const gl of seg.greek ?? []) {
        for (const tok of gl.tokens ?? []) {
          const ans = analyses[tok.k];
          if (!ans || ans.length === 0) continue;
          const a0 = ans[0];                              // primary analysis
          const key = (a0.lsj && a0.lsj[0]) || a0.lemma;
          if (!key) continue;
          tokenTotal++;
          const b = bucket(key);
          b.count++;
          b.lemmaBeta ||= a0.lemma;
          b.parse ||= a0.parse;
          b.byWork[w] = (b.byWork[w] ?? 0) + 1;
          const g = a0.gloss && cleanGloss(a0.gloss);
          if (g) b.glosses.set(g, (b.glosses.get(g) ?? 0) + 1);
          // Complete (capped) instance list for the per-work "every citation"
          // disclosure: compact [book, column, line, surface] tuples.
          if (b.instN < INSTANCE_CAP) {
            (b.inst[w] ??= []).push([book, seg.column, gl.n, tok.t]);
            b.instN++;
          }
        }
      }
    }
  }
}

// ── Rank, slug, emit ────────────────────────────────────────────────────────
const ranked = [...lemmata.values()].filter((b) => !isStop(b)).sort((a, b) => b.count - a.count);
const top = ranked.filter((b) => b.count >= MIN_COUNT);

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

const usedSlugs = new Set();
const manifest = {};   // popup: lsjKey -> { slug, head, count }
const index = [];      // getStaticPaths: [{ slug, key }]

for (const b of top) {
  const head = lsjHead(b.key) ?? b.lemmaBeta;
  let slug = slugify(b.lemmaBeta || b.key);
  if (usedSlugs.has(slug)) { let i = 2; while (usedSlugs.has(`${slug}-${i}`)) i++; slug = `${slug}-${i}`; }
  usedSlugs.add(slug);

  const byWork = Object.entries(b.byWork)
    .map(([w, n]) => ({ work: w, title: title[w], count: n }))
    .sort((x, y) => y.count - x.count);
  const glosses = [...b.glosses.entries()].sort((x, y) => y[1] - x[1]).map(([g]) => g).slice(0, 5);

  // Per-work instances, grouped book → chapter (each chapter's instances sorted
  // by Bekker). Book labels/bookless handling are applied on the page (needs the
  // registry); here we emit book NUMBER + chapter id + the chapter's Bekker span.
  // `shown` may be < the work's true count if the per-lemma INSTANCE_CAP was hit.
  const instancesByWork = byWork.map((bw) => {
    const raw = b.inst[bw.work] ?? [];   // [[book, col, line, surface], …]
    const bookMap = new Map();
    for (const [book, col, line, surface] of raw) {
      const ref = resolveChapter(bw.work, book, col, line);
      const chId = ref?.chapter ?? '?';
      if (!bookMap.has(book)) bookMap.set(book, new Map());
      const chMap = bookMap.get(book);
      if (!chMap.has(chId)) chMap.set(chId, { chapter: chId, bekker: ref?.bekker ?? '', order: ref?.order ?? 999, instances: [] });
      chMap.get(chId).instances.push([col, line, surface]);
    }
    const books = [...bookMap.keys()].sort((x, y) => x - y).map((book) => ({
      book,
      chapters: [...bookMap.get(book).values()]
        .sort((x, y) => x.order - y.order)
        .map((c) => ({
          chapter: c.chapter, bekker: c.bekker,
          instances: c.instances.sort((m, n) => posOf(m[0], m[1]) - posOf(n[0], n[1])),
        })),
    }));
    return { work: bw.work, title: bw.title, count: bw.count, shown: raw.length, books };
  });

  writeFileSync(join(OUT, `${slug}.json`), JSON.stringify({
    slug, key: b.key, head, lemmaBeta: b.lemmaBeta,
    count: b.count, byWork, glosses,
    instancesByWork,
    truncated: b.instN >= INSTANCE_CAP,
    bonitz: null,   // stub: lights up when the Index Aristotelicus entry is ready
  }));

  manifest[b.key] = { slug, head, count: b.count };
  index.push({ slug, key: b.key });
}

writeFileSync(join(DATA, 'lemmata.json'), JSON.stringify(manifest));
writeFileSync(join(OUT, '_index.json'), JSON.stringify(index));

// ── Report ──────────────────────────────────────────────────────────────────
console.log(`works scanned      : ${works.length}`);
console.log(`tokens resolved    : ${tokenTotal.toLocaleString()}`);
console.log(`distinct lemmata   : ${lemmata.size.toLocaleString()}`);
console.log(`pages emitted      : ${top.length.toLocaleString()} (count ≥ ${MIN_COUNT})`);
console.log(`  freq range       : ${top[0].count.toLocaleString()} … ${top[top.length - 1].count}`);
console.log(`held back (<${MIN_COUNT})   : ${(ranked.length - top.length).toLocaleString()} rarer lemmata`);
console.log(`sample slugs       : ${top.slice(0, 12).map((b) => manifest[b.key].slug).join(', ')}`);
