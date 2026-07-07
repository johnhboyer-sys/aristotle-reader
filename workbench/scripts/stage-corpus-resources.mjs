// Stage the corpus resources bundled into the packaged Translation Workbench.
//
// "Add work…" onboarding (src/lib/data/onboarding.ts) builds spine.json from
// the user's own TLG texts via Diogenes — that part is never bundled (TLG is
// the user's, not ours to ship). What onboarding CANNOT produce on its own is
// the precomputed per-work chapters.json (chapter-anchor list) and
// analyses.json (morphology for the click-to-parse lexicon), plus the shared
// LSJ dictionary shards — those come from this repo's own pipeline output
// (build/dist/<PipelineWork>/) and are public-domain citation/lexicon data,
// safe to ship as app resources (NOT TLG text; TLG's Greek is not among
// these files — see the module docstring above).
//
// This script copies that data into src-tauri/resources/corpus/, which
// tauri.conf.json's bundle.resources wires into every packaged build.
// src-tauri/resources/corpus/ is gitignored — never committed.
//
// Usage: node scripts/stage-corpus-resources.mjs
// Env overrides mirror scripts/build-dev-corpus.mjs:
//   ARISTOTLE_MAIN_CHECKOUT   default /Users/johnboyer/Developer/aristotle-reader
//   ARISTOTLE_BUILD_DIST      default <main checkout>/build/dist
//   STAGE_CORPUS_OUT          default src-tauri/resources/corpus

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const workbenchRoot = path.resolve(here, '..');
const mainCheckout = process.env.ARISTOTLE_MAIN_CHECKOUT
  ?? '/Users/johnboyer/Developer/aristotle-reader';
const distRoot = process.env.ARISTOTLE_BUILD_DIST ?? path.join(mainCheckout, 'build/dist');
const outRoot = process.env.STAGE_CORPUS_OUT
  ?? path.join(workbenchRoot, 'src-tauri/resources/corpus');

// workId (workbench manifest id) → pipeline build/dist/<name>/ dir. Mirrors
// scripts/build-dev-corpus.mjs's WORKS list and src/lib/data/spineConfig.ts's
// SPINE_CONFIG keys — the set of onboarding-supported works.
const WORKS = [
  { workId: 'metaphysics', pipelineDir: 'Meta' },
  { workId: 'posterior-analytics', pipelineDir: 'APo' },
];

// Each work's own chapters.json/analyses.json are pipeline build output too,
// but the WORKBENCH's chapters.json is a different shape from the pipeline's
// (array of {book,chapter,column,line,wordIndex,bookstart} vs. the reader's
// book-keyed object) — it must come from .dev-corpus/ (built by
// build-dev-corpus.mjs, which runs the TS corpus port over the pipeline's
// grc TEI). analyses.json IS the same file the pipeline emits directly, so
// it's read straight from build/dist/<PipelineWork>/.
const devCorpusRoot = process.env.DEV_CORPUS_OUT ?? path.join(workbenchRoot, '.dev-corpus');

let failed = false;

console.log(`Staging corpus resources → ${path.relative(workbenchRoot, outRoot)}/`);
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

for (const { workId, pipelineDir } of WORKS) {
  const chaptersSrc = path.join(devCorpusRoot, workId, 'chapters.json');
  const analysesSrc = path.join(distRoot, pipelineDir, 'analyses.json');

  if (!existsSync(chaptersSrc)) {
    console.error(
      `${workId}: chapters.json not found at ${chaptersSrc}\n` +
      `  Run 'node scripts/build-dev-corpus.mjs' first (it builds .dev-corpus/ from the pipeline).`,
    );
    failed = true;
    continue;
  }
  if (!existsSync(analysesSrc)) {
    console.error(`${workId}: analyses.json not found at ${analysesSrc}`);
    failed = true;
    continue;
  }

  const dir = path.join(outRoot, workId);
  mkdirSync(dir, { recursive: true });
  copyFileSync(chaptersSrc, path.join(dir, 'chapters.json'));
  copyFileSync(analysesSrc, path.join(dir, 'analyses.json'));
  console.log(`${workId}: chapters.json + analyses.json staged`);
}

// ── shared LSJ dictionary shards (one copy, used by every work) ────────────
const lsjSrcDir = path.join(distRoot, 'lsj');
if (existsSync(lsjSrcDir)) {
  const lsjOutDir = path.join(outRoot, 'lsj');
  mkdirSync(lsjOutDir, { recursive: true });
  const shards = readdirSync(lsjSrcDir).filter((f) => f.endsWith('.json'));
  for (const shard of shards) {
    copyFileSync(path.join(lsjSrcDir, shard), path.join(lsjOutDir, shard));
  }
  console.log(`lsj: ${shards.length} shards staged`);
} else {
  console.error(`lsj: shard directory not found at ${lsjSrcDir}`);
  failed = true;
}

if (failed) {
  console.error('Corpus resource staging FAILED — see errors above.');
  process.exit(1);
}
console.log('Corpus resource staging complete.');
