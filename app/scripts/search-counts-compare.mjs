// Compare two search-counts.mjs runs: every search's count line, page count,
// and (where both walked the pages) the rows on each page. Exits 1 on any
// difference, and says so when it compared no rows at all.
//   node scripts/search-counts-compare.mjs BEFORE.json AFTER.json
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')));
if (!a || !b) throw new Error('Usage: search-counts-compare.mjs BEFORE.json AFTER.json');
const after = new Map(b.map(r => [r.name, r]));
const diffs = [];
let rowsCompared = 0;
for (const x of a) {
  const y = after.get(x.name);
  if (!y) { diffs.push(`${x.name}: missing from the second run`); continue; }
  for (const k of ['total', 'hits', 'pages', 'greek', 'english']) {
    if (x[k] !== y[k]) diffs.push(`${x.name}: ${k} ${x[k]} → ${y[k]}`);
  }
  if (!x.rows || !y.rows) continue;
  if (x.rows.length !== y.rows.length) diffs.push(`${x.name}: ${x.rows.length} pages walked → ${y.rows.length}`);
  x.rows.forEach((page, i) => {
    const other = y.rows[i] ?? [];
    rowsCompared += page.length;
    if (page.length !== other.length) diffs.push(`${x.name}: page ${i + 1} has ${page.length} rows → ${other.length}`);
    const at = page.findIndex((row, j) => row !== other[j]);
    if (at >= 0) diffs.push(`${x.name}: page ${i + 1} row ${at + 1}: ${page[at]} → ${other[at]}`);
  });
}
for (const y of b) if (!a.some(x => x.name === y.name)) diffs.push(`${y.name}: missing from the first run`);
console.log(`${a.length} searches, ${rowsCompared} rows compared`);
if (!rowsCompared) console.log('No rows compared: run search-counts.mjs with --pages for a row-by-row check.');
for (const d of diffs) console.log(`DIFF ${d}`);
process.exit(diffs.length ? 1 : 0);
