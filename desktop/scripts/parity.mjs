// Parity harness for the TypeScript aligner port.
//
// 1. Builds per-chapter alignment inputs from the emitted dist data (the
//    work's primary English as reference, its Ross-style overlay reassembled
//    as the unmarked target) using the DESKTOP reference builder.
// 2. Runs the TS engine on every chapter.
// 3. Runs the REAL Python aligner on the identical inputs (parity_reference.py).
// 4. Diffs anchors: citation/offset/tier/confidence must match exactly,
//    scores within 1e-6, flags compared as sets (reported, not fatal — they
//    ride on float statistics where the last ulp can differ).
//
// Usage: node scripts/parity.mjs [WORK] [DATA_DIR]
//   WORK      default EN
//   DATA_DIR  default <repo>/build/dist

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const WORK = process.argv[2] ?? 'EN';
const DATA_DIR = process.argv[3] ?? path.join(repoRoot, 'build', 'dist');
const workDir = path.join(DATA_DIR, WORK);

// ── bundle the TS aligner for Node ──────────────────────────────────────────
const scratch = mkdtempSync(path.join(tmpdir(), 'aligner-parity-'));
const bundle = path.join(scratch, 'aligner.mjs');
await build({
  entryPoints: [path.join(desktopRoot, 'src/lib/aligner/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'silent',
});
const { alignChapter, checkRoundtrip, buildChapterInputs, reassembleOverlay } =
  await import(pathToFileURL(bundle).href);

// ── build chapter inputs from dist data ─────────────────────────────────────
const chapters = JSON.parse(readFileSync(path.join(workDir, 'chapters.json'), 'utf-8'));
const bookFiles = readdirSync(workDir).filter(f => /^book-\d+\.json$/.test(f)).sort();
const inputs = [];
for (const f of bookFiles) {
  const book = JSON.parse(readFileSync(path.join(workDir, f), 'utf-8'));
  const prose = reassembleOverlay(book, 'secondary');
  if (prose.size === 0) continue; // no overlay translation in this book
  inputs.push(...buildChapterInputs(book, chapters, prose));
}
if (!inputs.length) {
  console.error(`no overlay chapters found for ${WORK} — nothing to align`);
  process.exit(2);
}
const fixture = path.join(scratch, 'fixture.json');
writeFileSync(fixture, JSON.stringify({ work: WORK, chapters: inputs }));
console.log(`fixture: ${inputs.length} chapters from ${bookFiles.length} books (${WORK})`);

// ── TS side ──────────────────────────────────────────────────────────────────
const tsOut = {};
for (const ch of inputs) {
  const anchors = alignChapter(ch, null);
  checkRoundtrip(ch, anchors);
  tsOut[`${ch.book}:${ch.chapter}`] = anchors;
}

// ── Python side (the real pipeline aligner, same inputs) ────────────────────
const pyOutPath = path.join(scratch, 'py-out.json');
execFileSync('uv', ['run', 'python', path.join(here, 'parity_reference.py'), fixture, pyOutPath], {
  cwd: path.join(repoRoot, 'pipeline'),
  stdio: 'inherit',
});
const pyOut = JSON.parse(readFileSync(pyOutPath, 'utf-8'));

// ── diff ─────────────────────────────────────────────────────────────────────
let hard = 0, soft = 0, total = 0;
for (const key of Object.keys(pyOut)) {
  const py = pyOut[key], ts = tsOut[key] ?? [];
  if (py.length !== ts.length) {
    console.log(`✗ ${key}: anchor count ${py.length} (py) vs ${ts.length} (ts)`);
    hard++;
    continue;
  }
  for (let i = 0; i < py.length; i++) {
    total++;
    const p = py[i], t = ts[i];
    if (p.citation !== t.citation || p.offset !== t.offset
      || p.tier !== t.tier || p.confidence !== t.confidence) {
      console.log(`✗ ${key} #${i}: py ${p.citation}@${p.offset} ${p.tier}/${p.confidence}`
        + ` vs ts ${t.citation}@${t.offset} ${t.tier}/${t.confidence}`);
      hard++;
      continue;
    }
    if (Math.abs(p.score - t.score) > 1e-6) {
      console.log(`~ ${key} #${i} ${p.citation}: score ${p.score} vs ${t.score}`);
      soft++;
    }
    const pf = [...p.flags].sort().join('|'), tf = [...t.flags].sort().join('|');
    if (pf !== tf) {
      console.log(`~ ${key} #${i} ${p.citation}: flags [${pf}] vs [${tf}]`);
      soft++;
    }
  }
}
console.log(`\n${total} anchors compared across ${Object.keys(pyOut).length} chapters`);
console.log(`hard mismatches (citation/offset/tier/confidence): ${hard}`);
console.log(`soft mismatches (score/flags): ${soft}`);
process.exit(hard ? 1 : 0);
