// Package the desktop app for distribution.
//
// Preconditions: build/dist must hold a PUBLIC corpus — i.e. the output of
// `node scripts/build-public.mjs` (repo root), which rebuilds every work from
// its -public manifest. The local full corpus carries copyright-encumbered
// translations (Ackrill's Categories, Rackham's Eudemian Ethics) that MUST
// NOT be distributed; this script hard-refuses if it sees them.
//
// What it does:
//   1. gate: verify the corpus at DATA_DIR is the public build
//   2. copy it to src-tauri/corpus (gitignored)
//   3. DESKTOP_PUBLIC=1 tauri build --config tauri.public.conf.json
//      (flips PUBLIC_SHOW_PRIVATE off in the frontend, adds the corpus to
//       the bundle's resources — dev builds are untouched by either)
//
// Usage: node scripts/package-app.mjs [DATA_DIR]   (default <repo>/build/dist)

import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const repoRoot = path.resolve(desktopRoot, '..');
const DATA_DIR = process.argv[2] ?? path.join(repoRoot, 'build', 'dist');
const CORPUS = path.join(desktopRoot, 'src-tauri', 'corpus');

if (!existsSync(path.join(DATA_DIR, 'EN', 'manifest.json'))) {
  console.error(`No corpus at ${DATA_DIR} (EN/manifest.json missing).`);
  console.error('Run `node scripts/build-public.mjs` at the repo root first.');
  process.exit(1);
}

// ── gate: refuse a private corpus ────────────────────────────────────────────
// The private translations occupy known slots in known works; their presence
// identifies a full (non-public) build. Update alongside works.ts if another
// private entry is ever added.
const PRIVATE_MARKERS = [
  { work: 'Cat', file: 'book-01.json', key: '"third"', name: "Ackrill's Categories" },
  { work: 'EE', file: 'book-01.json', key: '"ross"', name: "Rackham's Eudemian Ethics" },
];
const found = [];
for (const m of PRIVATE_MARKERS) {
  const p = path.join(DATA_DIR, m.work, m.file);
  if (existsSync(p) && readFileSync(p, 'utf-8').includes(m.key)) found.push(m.name);
}
if (found.length) {
  console.error('REFUSING to package: the corpus at');
  console.error(`  ${DATA_DIR}`);
  console.error(`contains private (copyright-encumbered) content: ${found.join(', ')}.`);
  console.error('Rebuild it publicly first:  node scripts/build-public.mjs');
  process.exit(1);
}
console.log('Corpus gate passed: no private content detected.');

// ── copy corpus into the bundle staging dir ──────────────────────────────────
console.log(`Staging corpus → ${CORPUS}`);
rmSync(CORPUS, { recursive: true, force: true });
cpSync(DATA_DIR, CORPUS, { recursive: true, dereference: true });

// ── build ─────────────────────────────────────────────────────────────────────
// Release config (updater artifacts, signed) is used automatically when
// present; see README "Releasing".
const releaseConf = path.join(desktopRoot, 'src-tauri', 'tauri.release.conf.json');
const useRelease = existsSync(releaseConf);
if (useRelease && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  console.error('tauri.release.conf.json present but TAURI_SIGNING_PRIVATE_KEY is not set.');
  console.error('Set TAURI_SIGNING_PRIVATE_KEY (+ _PASSWORD) or remove the release config.');
  process.exit(1);
}
const confArg = useRelease ? 'src-tauri/tauri.release.conf.json' : 'src-tauri/tauri.public.conf.json';
console.log(`Building the app (public frontend + bundled corpus) with ${confArg}…`);
const r = spawnSync('npm', ['run', 'tauri', '--', 'build', '--config', confArg], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    DESKTOP_PUBLIC: '1',
    // create-dmg's Finder-scripting DMG styling fails outside an interactive
    // GUI session; CI=1 makes the bundler skip it (plain DMG).
    CI: process.env.CI ?? 'true',
  },
});
process.exit(r.status ?? 1);
