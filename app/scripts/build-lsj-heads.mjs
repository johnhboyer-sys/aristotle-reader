// Build-time manifest: LSJ key → { head, hom }.
//
// The word popup shows one card per dictionary entry, and each card needs two
// things about that entry before the reader taps anything: the Unicode headword
// (so key `ei)mi/` displays as εἰμί) and LSJ's own homograph letter (the (A) in
// "δέω (A)"). Nothing else — since 2026-08-29 the entry TEXT is served by
// grammata, keyed, at roughly 8 KB a tap.
//
// Without this manifest the popup got both fields by downloading a whole letter
// shard per lookup: 6.7 MB of public/data/lsj/e.json to learn how to spell a
// word, with every sense and citation in it thrown away unread. Measured in one
// session, three word clicks pulled 9.1 MB of shards.
//
// public/data/lemmata.json cannot serve this: it is the lemma-PAGE manifest,
// scoped to lemmata with a page (MIN_COUNT 3, top-N), so it holds 6,214 of the
// 14,047 keys the analyses actually name — and the ones it misses are the
// commonest words in the corpus (o(1, kai/1, de/1, ga/r, me/n).
//
// The desktop app still reads the shards: it renders entries locally and must
// work offline. This manifest changes the website only.
//
// Emits public/data/lsj-heads.json.
// Run: node scripts/build-lsj-heads.mjs   (from app/)

import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DATA = 'public/data';
const OUT = join(DATA, 'lsj-heads.json');

// ── every LSJ key any analysis names ────────────────────────────────────────
// Keyed on what the reader can actually ask for, not on what the dictionary
// holds: an entry no analysis points at can never surface in a card.
const wanted = new Set();
let works = 0;
for (const d of readdirSync(DATA, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const f = join(DATA, d.name, 'analyses.json');
  if (!existsSync(f)) continue;
  works++;
  const analyses = JSON.parse(readFileSync(f, 'utf8'));
  for (const token of Object.values(analyses)) {
    for (const a of token) for (const k of a.lsj ?? []) wanted.add(k);
  }
}

// ── read the head and the homograph letter out of the shards ────────────────
// LSJ marks its own homographs in the entry text — "νέω (A)", "νέω (B)". Read
// that letter; never derive one from the key's trailing digit. ka/r2 is LSJ's
// (A) and li^to/s2 likewise, so the digit disagrees on six entries, and 32% of
// numbered keys carry no letter at all — those get none rather than an
// invention.
const HOM = /^\s*\S+\s*\(([A-Z])\)/;

const out = {};
let missing = 0;
const shardDir = join(DATA, 'lsj');
for (const f of readdirSync(shardDir)) {
  if (!f.endsWith('.json')) continue;
  const shard = JSON.parse(readFileSync(join(shardDir, f), 'utf8'));
  for (const [key, entry] of Object.entries(shard)) {
    if (!wanted.has(key)) continue;
    const rec = { head: entry.head };
    const m = HOM.exec(String(entry.html ?? '').replace(/<[^>]+>/g, ''));
    if (m) rec.hom = m[1];
    out[key] = rec;
  }
}
for (const k of wanted) if (!out[k]) missing++;

// Refuse to write a manifest with holes. Printing the hole and exiting 0 is
// how a silent gap ships: an app-only `npm run build` never runs
// verify_shared_lsj, so anything checking only the exit status would call this
// a success. A key with no shard entry means the popup falls back to
// transliterating the lemma for that word, which looks like a headword bug
// somewhere else entirely.
if (works === 0) {
  console.error('lsj-heads: no analyses.json found under ' + DATA + ' — refusing to write.');
  process.exit(1);
}
if (missing > 0) {
  console.error(
    `lsj-heads: ${missing} of ${wanted.size} keys had no shard entry — refusing to ` +
    'write an incomplete manifest. Rebuild the LSJ shards first.',
  );
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(out));
const kb = (statSync(OUT).size / 1024).toFixed(0);
const withHom = Object.values(out).filter(r => r.hom).length;
console.log(
  `lsj-heads: ${Object.keys(out).length} entries from ${works} works ` +
  `(${withHom} with a homograph letter, ${missing} keys had no shard entry) — ${kb} KB`,
);
