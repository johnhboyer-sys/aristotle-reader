// Build the corpus-wide Bekker index: every column under public/data/<work>/
// → the works and books that carry it, as [work, book, lo, hi] tuples. The ⌘K
// palette fetches this one file to jump to a citation from anywhere on the
// site, not just from within the work that happens to be open.
//
// Emits public/data/bekker.json.
//
// It is a dumb aggregate of the per-work columns.json files: which works are
// actually cited by Bekker is the registry's business (shared/lib/works.ts),
// and the palette filters non-Bekker works — the Isagoge's Busse pages, whose
// page numbers collide with real columns — at query time.
//
// Run: node scripts/build-bekker-index.mjs   (from app/)

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DATA = 'public/data';

const index = {};
const works = [];

for (const entry of readdirSync(DATA).sort()) {
  const file = join(DATA, entry, 'columns.json');
  try {
    if (!statSync(file).isFile()) continue;
  } catch {
    continue; // not a built work directory
  }
  works.push(entry);
  const columns = JSON.parse(readFileSync(file, 'utf-8'));
  for (const [column, refs] of Object.entries(columns)) {
    for (const r of refs) (index[column] ??= []).push([entry, r.book, r.lo, r.hi]);
  }
}

// A silent empty index would leave every citation falling through to search —
// the bug this file exists to fix. Fail the build instead.
if (!works.length) {
  console.error(`bekker index: no columns.json found under ${DATA}`);
  process.exit(1);
}

const out = join(DATA, 'bekker.json');
writeFileSync(out, JSON.stringify(index), 'utf-8');
const shared = Object.values(index).filter((e) => e.length > 1).length;
console.log(`bekker index       : ${Object.keys(index).length} columns from ${works.length} works`);
console.log(`  shared columns   : ${shared} (two books or two works in one column)`);
