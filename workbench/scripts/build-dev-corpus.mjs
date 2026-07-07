// Build the browser-dev corpus for the Translation Workbench.
//
// Runs the parity-proven TS ports (corpus/spine.ts parseSpine + corpus/chapters.ts
// extractChaptersGrc) over:
//   - the cached Diogenes verse-mode export XML in the MAIN checkout (read-only;
//     TLG-derived, NEVER committed), and
//   - the grc TEI named by the pipeline manifest (manifests/Meta.yaml) resolved
//     against this worktree's sources/,
// and writes  .dev-corpus/<workId>/spine.json + chapters.json  which the vite
// dev middleware serves at /corpus/<workId>/*.json.
//
// Also copies the pipeline's word-analysis + shared LSJ dictionary data (for
// the click-to-parse lexicon drawer) straight from the main checkout's build
// output, read-only:
//   build/dist/<PipelineWork>/analyses.json  -> .dev-corpus/<workId>/analyses.json
//   build/dist/lsj/<letter>.json             -> .dev-corpus/lsj/<letter>.json
// served at /corpus/<workId>/analyses.json and /corpus/lsj/<letter>.json —
// same shape as $APPDATA/corpus/... in the Tauri build (see
// src/lib/lexicon/provider.ts). The LSJ dictionary is shared across every
// work (~46MB, copied once), matching the reader app's one-shared-copy
// convention (app/src/lib/data.ts fetchLsjShard).
//
// .dev-corpus/ is gitignored (workbench/.gitignore) — spine.json/analyses.json
// contain TLG-derived Greek text and must never land in the repo.
//
// Usage: node scripts/build-dev-corpus.mjs
// All paths are env-overridable (same vars as scripts/parity-corpus.mjs where
// they overlap). Exits 1 with a plain message when an input is missing.

import { build } from 'esbuild';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(here, '..');
const worktreeRoot = path.resolve(workbenchRoot, '..');
const mainCheckout = process.env.ARISTOTLE_MAIN_CHECKOUT
  ?? '/Users/johnboyer/Developer/aristotle-reader';

// workId (workbench manifest id) → pipeline inputs.
const WORKS = [
  {
    workId: 'metaphysics',
    manifestPath: path.join(worktreeRoot, 'manifests/Meta.yaml'),
    xmlPath: path.join(mainCheckout, 'build/export/Diogenes-Resources/xml/tlg/tlg0086025.xml'),
    // Pipeline build output dir name (build/dist/<name>/) — distinct from
    // workId, which is the workbench's own manifest id.
    pipelineDir: 'Meta',
  },
  {
    workId: 'posterior-analytics',
    manifestPath: path.join(worktreeRoot, 'manifests/APo.yaml'),
    xmlPath: path.join(mainCheckout, 'build/export/Diogenes-Resources/xml/tlg/tlg0086001.xml'),
    pipelineDir: 'APo',
  },
];

const outRoot = process.env.DEV_CORPUS_OUT ?? path.join(workbenchRoot, '.dev-corpus');
const distRoot = process.env.ARISTOTLE_BUILD_DIST ?? path.join(mainCheckout, 'build/dist');

// ── bundle the TS corpus port for Node ──────────────────────────────────────
const scratch = mkdtempSync(path.join(tmpdir(), 'dev-corpus-'));
const bundle = path.join(scratch, 'corpus.mjs');
await build({
  entryPoints: [path.join(workbenchRoot, 'src/lib/corpus/parity-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'silent',
});
const { parseSpine, extractChaptersGrc } = await import(pathToFileURL(bundle).href);

let failed = false;

for (const work of WORKS) {
  const { workId, manifestPath, xmlPath, pipelineDir } = work;

  if (!existsSync(manifestPath)) {
    console.error(`${workId}: pipeline manifest not found at ${manifestPath}`);
    failed = true;
    continue;
  }
  if (!existsSync(xmlPath)) {
    console.error(`${workId}: cached Diogenes export XML not found at ${xmlPath}`);
    failed = true;
    continue;
  }

  const manifestYaml = yamlLoad(readFileSync(manifestPath, 'utf-8'));
  const grcTeiPath = path.join(worktreeRoot, 'sources', manifestYaml.chapters.grc_tei);
  if (!existsSync(grcTeiPath)) {
    console.error(`${workId}: grc TEI not found at ${grcTeiPath}`);
    failed = true;
    continue;
  }

  const spineManifest = {
    work_id: manifestYaml.work.id,
    greek_edition: manifestYaml.work.greek_edition,
    citation_scheme: manifestYaml.citation?.scheme,
    books: manifestYaml.books,
  };

  const spine = parseSpine(readFileSync(xmlPath, 'utf-8'), spineManifest);

  const chaptersCfg = manifestYaml.chapters;
  const chapters = extractChaptersGrc(spine, readFileSync(grcTeiPath, 'utf-8'), {
    chapterSubtype: chaptersCfg.chapter_subtype ?? 'chapter',
    bookSubtype: chaptersCfg.book_subtype ?? 'book',
    chapterMarker: chaptersCfg.chapter_marker ?? 'div',
    topBook: chaptersCfg.grc_book ?? null,
    extra: chaptersCfg.extra ?? null,
  });

  const dir = path.join(outRoot, workId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'spine.json'), JSON.stringify(spine), 'utf-8');
  writeFileSync(path.join(dir, 'chapters.json'), JSON.stringify(chapters, null, 1), 'utf-8');

  // ── word analyses (click-to-parse lexicon) ─────────────────────────────
  const analysesPath = path.join(distRoot, pipelineDir, 'analyses.json');
  if (existsSync(analysesPath)) {
    copyFileSync(analysesPath, path.join(dir, 'analyses.json'));
    console.log(`${workId}: analyses.json copied from ${path.relative(mainCheckout, analysesPath)}`);
  } else {
    console.warn(`${workId}: analyses.json not found at ${analysesPath} — lexicon drawer will be empty`);
  }

  // ── sanity report ─────────────────────────────────────────────────────────
  const books = new Set(spine.segments.map((s) => s.book));
  const lineCount = spine.segments.reduce((sum, s) => sum + s.lines.length, 0);
  const midLine = chapters.filter((c) => c.wordIndex > 0);
  console.log(`${workId}: ${books.size} books, ${chapters.length} chapters, ${lineCount} spine lines`
    + ` → ${path.relative(workbenchRoot, dir)}/`);
  if (midLine.length) {
    console.log(`${workId}: ${midLine.length} chapters start mid-line (wordIndex > 0):`);
    for (const c of midLine) {
      console.log(`  book ${c.book} ch ${c.chapter} @ ${c.column}${c.line} word ${c.wordIndex}`);
    }
  }
}

// ── shared LSJ dictionary shards (one copy, used by every work) ────────────
// Mirrors app/src/lib/data.ts's fetchLsjShard: a single /corpus/lsj/<letter>.json
// tree shared across the whole corpus, not duplicated per work.
const lsjSrcDir = path.join(distRoot, 'lsj');
if (existsSync(lsjSrcDir)) {
  const lsjOutDir = path.join(outRoot, 'lsj');
  mkdirSync(lsjOutDir, { recursive: true });
  const shards = readdirSync(lsjSrcDir).filter((f) => f.endsWith('.json'));
  for (const shard of shards) {
    copyFileSync(path.join(lsjSrcDir, shard), path.join(lsjOutDir, shard));
  }
  console.log(`lsj: ${shards.length} shards copied → ${path.relative(workbenchRoot, lsjOutDir)}/`);
} else {
  console.warn(`lsj: shard directory not found at ${lsjSrcDir} — lexicon drawer will show no LSJ entries`);
}

process.exit(failed ? 1 : 0);
