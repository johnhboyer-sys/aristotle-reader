// Live check of the AUTHTAB.DIR parser against real discs. Hand-built bytes
// can only prove the rules I already believe; a 1999 TLG disc and a 1991 PHI
// disc are the only things that can prove I read the format right — they were
// pressed by different people, eight years apart, and differ in exactly the
// place that matters (PHI declares a language per author, TLG doesn't).
//
// The strongest assertion here is the cross-check that every id the table
// lists has a matching .TXT on the disc. A parser that mis-split records would
// still produce plausible-looking names, but its ids would stop resolving.
//
// Self-skipping: no disc is a normal machine, not a failure. node:fs comes in
// through a structural shim, as in lexicon/__tests__/morphologyLive.test.ts.
import { describe, expect, it } from 'vitest';
import { parseAuthtab, corpusForAuthorId } from '../authtab';

interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string): Uint8Array;
}
const fsSpecifier = 'node:fs';
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ fsSpecifier)) as unknown as NodeFs;

/**
 * Where to find a disc, in priority order:
 *   1. WORKBENCH_TLG_DIR / WORKBENCH_PHI_DIR — set these to point the test
 *      anywhere, which is also how a Windows machine runs it (C:\TLG has no
 *      guessable equivalent of a Mac path).
 *   2. The tlgDir the app itself has saved, so the test follows the folder
 *      the user actually picked instead of a path hardcoded here.
 *
 * Deliberately NO hardcoded fallback: a path from one developer's home
 * directory makes the suite report a skip as a pass on every other machine.
 * The fixture-backed tests in authtab.test.ts are the coverage that always
 * runs; this suite is the extra proof available when a disc is present.
 */
const APP_SETTINGS = [
  `${env('HOME') ?? ''}/Library/Application Support/org.aristotlereader.workbench/settings.json`,
  `${env('APPDATA') ?? ''}/org.aristotlereader.workbench/settings.json`,
];

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

/** The disc folder the app has saved, if the settings file is readable. */
function savedTlgDir(): string | undefined {
  for (const path of APP_SETTINGS) {
    if (!path.startsWith('/') && !/^[A-Za-z]:/.test(path)) continue;
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(readFileSync(path)));
      const dir = parsed?.tlgDir;
      if (typeof dir === 'string' && dir.length > 0) return dir;
    } catch {
      // A malformed settings file just means no disc hint.
    }
  }
  return undefined;
}

const DISCS = [
  { label: 'TLG', dir: env('WORKBENCH_TLG_DIR') ?? savedTlgDir(), corpus: 'tlg' as const },
  { label: 'PHI', dir: env('WORKBENCH_PHI_DIR'), corpus: 'phi' as const },
];

/**
 * The table file inside a disc folder, or null. Both spellings are checked:
 * the discs ship it uppercase, but a folder copied through a case-sensitive
 * filesystem can end up either way. Forward slashes are fine on Windows too —
 * every filesystem API there accepts them.
 */
function authtabIn(dir: string | undefined): string | null {
  if (!dir) return null;
  for (const name of ['AUTHTAB.DIR', 'authtab.dir']) {
    const path = `${dir.replace(/[\\/]+$/, '')}/${name}`;
    if (existsSync(path)) return path;
  }
  return null;
}

for (const disc of DISCS) {
  const table = authtabIn(disc.dir);

  describe.skipIf(!table)(`${disc.label} disc`, () => {
    const authors = table ? parseAuthtab(readFileSync(table)) : [];

    it('finds a substantial author list', () => {
      expect(authors.length).toBeGreaterThan(100);
    });

    it('gives every author an id in the disc shape', () => {
      for (const a of authors) expect(a.id).toMatch(/^[A-Z]{3}\d{4}$/);
    });

    it('gives every author a non-empty name with no leftover markup', () => {
      for (const a of authors) {
        expect(a.name.length).toBeGreaterThan(0);
        expect(a.name).not.toMatch(/[&\x00-\x1f\x7f-￿]/);
      }
    });

    it('has no duplicate ids', () => {
      expect(new Set(authors.map((a) => a.id)).size).toBe(authors.length);
    });

    it('lists only ids that exist as files on the disc', () => {
      // The real proof the records are split correctly.
      const dir = table!.replace(/\/[^/]+$/, '');
      const missing = authors.filter((a) => !existsSync(`${dir}/${a.id}.TXT`) && !existsSync(`${dir}/${a.id}.txt`));
      expect(missing.map((a) => a.id)).toEqual([]);
    });

    it('routes every author to this disc’s corpus', () => {
      const wrong = authors.filter((a) => corpusForAuthorId(a.id) !== disc.corpus);
      // The PHI disc carries a few non-LAT ids (CIV, COP); they are still phi.
      expect(wrong.map((a) => a.id)).toEqual([]);
    });
  });
}

const tlgTable = authtabIn(DISCS[0].dir);
describe.skipIf(!tlgTable)('TLG specifics', () => {
  // The body of a skipped describe still RUNS at collection time — only its
  // `it`s are skipped — so this must not read a file that isn't there.
  const authors = tlgTable ? parseAuthtab(readFileSync(tlgTable)) : [];

  it('lists Aristotle under the number the pipeline already uses', () => {
    const aristotle = authors.find((a) => a.id === 'TLG0086');
    expect(aristotle?.name).toMatch(/Aristoteles/);
  });

  it('lists authors far beyond the ones the app ships support for', () => {
    // The whole point: import is not limited to Aristotle and Plato.
    const names = authors.map((a) => a.name).join(' | ');
    expect(names).toMatch(/Plato/);
    expect(names).toMatch(/Thucydides/);
    expect(authors.length).toBeGreaterThan(1000);
  });

  it('declares no per-author language, because the disc is all Greek', () => {
    expect(authors.every((a) => a.language === undefined)).toBe(true);
  });
});

const phiTable = authtabIn(DISCS[1].dir);
describe.skipIf(!phiTable)('PHI specifics', () => {
  const authors = phiTable ? parseAuthtab(readFileSync(phiTable)) : [];

  it('declares a language for every author', () => {
    expect(authors.every((a) => a.language !== undefined)).toBe(true);
  });

  it('is mostly Latin but not only Latin', () => {
    const latin = authors.filter((a) => a.language === 'latin').length;
    expect(latin).toBeGreaterThan(authors.length * 0.9);
    expect(latin).toBeLessThan(authors.length);
  });
});
