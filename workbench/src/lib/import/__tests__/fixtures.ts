/**
 * Test-time fixture builder for the import suite (d3 §10). Reads a REAL chapter
 * (Metaphysics Ζ.17 = book 7, chapter 17) from `.dev-corpus/metaphysics` AT TEST
 * TIME and degrades it programmatically. No TLG-derived Greek is checked into
 * the repo — everything here is generated from the gitignored `.dev-corpus`.
 *
 * If `.dev-corpus/metaphysics` is missing (CI has no TLG), `loadDevCorpus`
 * returns null and every test SKIPS with a clear message rather than failing.
 *
 * Determinism: the only randomness is a self-contained mulberry32 PRNG seeded
 * with a fixed constant, so a degraded fixture is byte-identical across runs.
 */

import type { WorkCorpus } from '../../data/corpusStore';
import { chapterSpineRows } from '../../data/chapterRows';
import { getWork } from '../../works/manifest';
import type { WorkManifest } from '../../works/manifest';

// This project carries no @types/node (see vite.config.ts / greekToBeta test):
// a static `import 'node:fs'` breaks `tsc --noEmit` even though vitest's node
// environment provides fs at runtime. Use the same computed-specifier idiom.
interface NodeFsSync {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf-8'): string;
}
async function nodeFs(): Promise<NodeFsSync> {
  return (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as NodeFsSync;
}

/**
 * `.dev-corpus/metaphysics` lives at the workbench package root. Derive that
 * root from this module's URL (…/workbench/src/lib/import/__tests__/fixtures.ts)
 * rather than process.cwd() (no @types/node) — strip back to `workbench/`.
 * Overridable with VITE_DEV_CORPUS for a checkout in a different location.
 */
function metaDir(): string {
  const override = import.meta.env.VITE_DEV_CORPUS as string | undefined;
  if (override) return `${override.replace(/\/$/, '')}/metaphysics`;
  const here = new URL('.', import.meta.url).pathname; // …/src/lib/import/__tests__/
  const root = here.replace(/\/src\/lib\/import\/__tests__\/$/, '');
  return `${root}/.dev-corpus/metaphysics`;
}

/** Load the Metaphysics dev corpus, or null when `.dev-corpus` is absent (CI). */
export async function loadDevCorpus(): Promise<WorkCorpus | null> {
  const fs = await nodeFs();
  const dir = metaDir();
  const spinePath = `${dir}/spine.json`;
  const chaptersPath = `${dir}/chapters.json`;
  if (!fs.existsSync(spinePath) || !fs.existsSync(chaptersPath)) return null;
  const spine = JSON.parse(fs.readFileSync(spinePath, 'utf-8'));
  const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf-8'));
  return { spine, chapters };
}

export function metaWork(): WorkManifest {
  return getWork('metaphysics');
}

export function apoWork(): WorkManifest {
  return getWork('posterior-analytics');
}

/** Package-root directory (…/workbench). */
function packageRoot(): string {
  const override = import.meta.env.VITE_DEV_CORPUS as string | undefined;
  if (override) return override.replace(/\/[^/]+\/?$/, ''); // strip trailing corpus dir if given
  const here = new URL('.', import.meta.url).pathname; // …/src/lib/import/__tests__/
  return here.replace(/\/src\/lib\/import\/__tests__\/$/, '');
}

/** Load a work's dev corpus by id, or null when `.dev-corpus/<id>` is absent. */
export async function loadDevCorpusFor(id: string): Promise<WorkCorpus | null> {
  const fs = await nodeFs();
  const dir = `${packageRoot()}/.dev-corpus/${id}`;
  const spinePath = `${dir}/spine.json`;
  const chaptersPath = `${dir}/chapters.json`;
  if (!fs.existsSync(spinePath) || !fs.existsSync(chaptersPath)) return null;
  const spine = JSON.parse(fs.readFileSync(spinePath, 'utf-8'));
  const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf-8'));
  return { spine, chapters };
}

/** The four gitignored scrivener sample files, or null when absent (CI). */
export interface ScrivenerSamples {
  metaGreek: string;
  metaEnglish: string;
  apoGreek: string;
  apoEnglish: string;
}
export async function loadScrivenerSamples(): Promise<ScrivenerSamples | null> {
  const fs = await nodeFs();
  const dir = `${packageRoot()}/.dev-corpus/scrivener-samples`;
  const files = {
    metaGreek: `${dir}/Meta 7.17 Greek.md`,
    metaEnglish: `${dir}/Meta 7.17 (English).md`,
    apoGreek: `${dir}/APo 1.4 Greek.md`,
    apoEnglish: `${dir}/APo 1.4 English.md`,
  };
  for (const p of Object.values(files)) if (!fs.existsSync(p)) return null;
  return {
    metaGreek: fs.readFileSync(files.metaGreek, 'utf-8'),
    metaEnglish: fs.readFileSync(files.metaEnglish, 'utf-8'),
    apoGreek: fs.readFileSync(files.apoGreek, 'utf-8'),
    apoEnglish: fs.readFileSync(files.apoEnglish, 'utf-8'),
  };
}

/** The real Ζ.17 spine rows (address raw + Greek), straight from the corpus. */
export interface RealRow {
  address: string;
  greek: string;
}

export function realZ17(corpus: WorkCorpus): RealRow[] {
  const win = chapterSpineRows(corpus, 7, 17);
  if (!win) throw new Error('fixture: Ζ.17 window not found in dev corpus');
  const rows: RealRow[] = [];
  for (let k = win.start; k <= win.end; k++) {
    const line = win.flat[k];
    rows.push({ address: `${line.column}${line.n}`, greek: line.text });
  }
  return rows;
}

// ── deterministic PRNG (mulberry32) ──────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── orthographic noise (fixture 1) ───────────────────────────────────────────

// Diacritic-stripping is NOT applied (norm() already ignores diacritics); the
// noise we inject is what a HAND-TYPED chapter carries that survives norm():
// σ/ς position flips (norm folds these anyway → must stay ≥0.55) and movable-nu
// drops (folded in compareKey). We also swap a few accented vowels for bare ones
// to prove diacritic insensitivity end-to-end.

const ACCENT_FOLD: Record<string, string> = {
  ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ό: 'ο', ύ: 'υ', ώ: 'ω',
  ὰ: 'α', ὲ: 'ε', ὴ: 'η', ὶ: 'ι', ὸ: 'ο', ὺ: 'υ', ὼ: 'ω',
};

/** Degrade one line: fold some accents, flip σ↔ς, drop a movable nu or two. */
export function noisyLine(greek: string, rand: () => number): string {
  let out = '';
  for (const ch of greek) {
    if (ACCENT_FOLD[ch] && rand() < 0.5) out += ACCENT_FOLD[ch];
    else out += ch;
  }
  // Flip internal ς → σ and terminal σ → ς at a couple of spots.
  out = out.replace(/ς/g, (m) => (rand() < 0.4 ? 'σ' : m));
  // Drop a terminal movable nu after a vowel on a fraction of words.
  out = out.replace(/([αειουηω]ν)(\s|$)/gu, (m, g1: string, g2: string) =>
    rand() < 0.4 ? g1.slice(0, -1) + g2 : m,
  );
  return out;
}

/** Build the canonical import file text from matched Greek/English line arrays. */
export function importFileText(
  greek: string[],
  english: string[],
  frontmatter: { work: string; book?: number; chapter?: number; bekkerStart?: string },
): string {
  const fm: string[] = ['---', `work: ${frontmatter.work}`];
  if (frontmatter.book !== undefined) fm.push(`book: ${frontmatter.book}`);
  if (frontmatter.chapter !== undefined) fm.push(`chapter: ${frontmatter.chapter}`);
  if (frontmatter.bekkerStart !== undefined) fm.push(`bekker_start: ${frontmatter.bekkerStart}`);
  fm.push('---');
  return [...fm, '[GREEK]', ...greek, '[ENGLISH]', ...english].join('\n') + '\n';
}

/** Placeholder English keyed to the row so merges/splits are visible in asserts. */
export function stubEnglish(rows: RealRow[]): string[] {
  return rows.map((r, i) => `English for ${r.address} (line ${i + 1})`);
}
