// Build the divisions table: every corpus work's book and chapter starts, in
// Bekker addresses, keyed by the TLG ids the disc importer already knows.
//
// Why: a work imported from a TLG disc arrives with the disc's own structure
// and no more — for Aristotle that is the Bekker page and line, plus whatever
// title lines the edition prints. The Physics comes in as eight book titles and
// 5,520 lines, with none of its 71 chapters, because the disc carries no
// chapter level at all. This repo does: manifests/<ID>.yaml ties a work to its
// TLG author/work numbers, and build/dist/<ID>/chapters.json holds every
// chapter's exact start column and line. Ship that, and an import can lay down
// the divisions instead of the translator marking 71 of them by hand.
//
// What is NOT here: any text. Book and chapter starts are citation data — the
// same public-domain apparatus as chapters.json, which is already staged into
// the app (see stage-corpus-resources.mjs).
//
// Usage: node scripts/build-divisions.mjs
// Runs AFTER stage-corpus-resources.mjs in `npm run stage:corpus`: that script
// wipes src-tauri/resources/corpus/ before it copies, so a table written first
// would not survive it.
// Env overrides mirror the other corpus scripts:
//   ARISTOTLE_MAIN_CHECKOUT   default /Users/johnboyer/Developer/aristotle-reader
//   ARISTOTLE_BUILD_DIST      default <main checkout>/build/dist
//   ARISTOTLE_MANIFESTS       default <main checkout>/manifests

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(here, '..');
const mainCheckout = process.env.ARISTOTLE_MAIN_CHECKOUT ?? '/Users/johnboyer/Developer/aristotle-reader';
const distRoot = process.env.ARISTOTLE_BUILD_DIST ?? path.join(mainCheckout, 'build/dist');
const manifestRoot = process.env.ARISTOTLE_MANIFESTS ?? path.join(mainCheckout, 'manifests');

/** "184a10" → { column: "184a", line: 10 }; null when it isn't an address. */
function parseBekker(raw) {
  const m = /^(\d+[ab])\.?(\d+)$/.exec(String(raw).trim());
  return m ? { column: m[1], line: Number(m[2]) } : null;
}

const works = [];
const skipped = [];

for (const file of readdirSync(manifestRoot).filter((f) => f.endsWith('.yaml')).sort()) {
  const manifest = yaml.load(readFileSync(path.join(manifestRoot, file), 'utf8'));
  const work = manifest?.work;
  if (!work?.id || !work.tlg_author || !work.tlg_work) {
    skipped.push(`${file}: no tlg_author/tlg_work`);
    continue;
  }

  const chaptersPath = path.join(distRoot, work.id, 'chapters.json');
  if (!existsSync(chaptersPath)) {
    skipped.push(`${file}: no build/dist/${work.id}/chapters.json`);
    continue;
  }

  // chapters.json: { "<book>": [{ chapter, column, line, bekker }, …] }
  const byBook = JSON.parse(readFileSync(chaptersPath, 'utf8'));
  const chapters = [];
  for (const [book, list] of Object.entries(byBook)) {
    for (const entry of list) {
      const column = String(entry.column ?? '');
      const line = Number(entry.line);
      if (!column || !Number.isInteger(line)) continue;
      chapters.push({ book: Number(book), n: Number(entry.chapter), column, line });
    }
  }
  if (chapters.length === 0) {
    skipped.push(`${file}: chapters.json held no usable entries`);
    continue;
  }

  // Book starts come from the manifest where it declares them, else from each
  // book's first chapter — which is the same address in every work checked.
  const books = [];
  const declared = Array.isArray(manifest.books) ? manifest.books : [];
  const bookNumbers = [...new Set(chapters.map((c) => c.book))].sort((a, b) => a - b);
  for (const n of bookNumbers) {
    const fromManifest = declared.find((b) => Number(b.n) === n);
    const parsed = fromManifest ? parseBekker(fromManifest.start) : null;
    const firstChapter = chapters.find((c) => c.book === n);
    books.push({
      n,
      column: parsed?.column ?? firstChapter.column,
      line: parsed?.line ?? firstChapter.line,
    });
  }

  works.push({
    id: work.id,
    title: String(work.title ?? work.id),
    tlgAuthor: String(work.tlg_author),
    tlgWork: String(work.tlg_work),
    books,
    chapters,
  });
}

const payload = { version: 1, works };
const json = JSON.stringify(payload) + '\n';

const outputs = [
  path.join(workbenchRoot, '.dev-corpus', 'divisions.json'),
  path.join(workbenchRoot, 'src-tauri/resources/corpus', 'divisions.json'),
];
for (const out of outputs) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, json);
}

const chapterCount = works.reduce((sum, w) => sum + w.chapters.length, 0);
console.log(
  `divisions: ${works.length} works, ${chapterCount} chapters, ${(json.length / 1024).toFixed(0)}KB`,
);
for (const note of skipped) console.log(`  skipped ${note}`);
