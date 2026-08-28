// Every cached Diogenes export, run through the importer.
//
// Each test here parses the whole cache — 55 works, 122,429 citations — so they
// carry an explicit timeout: the 5-second default is a coin flip on a busy
// machine, and a green suite that fails when something else is compiling is
// worse than no test at all.
//
// This is the test that would have caught the Physics failing to import. Hand
// written TEI proves the rules I already believe; 122,429 real citations prove
// the ones I don't. Of those, 78 join two line numbers — "205a.25,29",
// "184b.25-26", "110/111" — and the citation scheme rejected all three, which
// cost the entire work rather than the one line. Nothing smaller than a whole
// corpus finds a defect that rare.
//
// Self-skipping: the cache only exists once someone has imported from a disc,
// so a machine without one is a normal machine, not a failure. node:fs comes in
// through a structural shim, as in corpus/__tests__/authtabLive.test.ts.
import { describe, expect, it } from 'vitest';
import { parseTeiRows } from '../../corpus/teiRows';
import { createSourceImport } from '../createSourceImport';
import { serializeChapterFile, parseChapterFile } from '../../chapterfile';
import { hydrateFromFile } from '../../library/autosave';
import { buildOutline } from '../../editor/outline';
import { DEFAULT_PROFILE } from '../../works/profile';

interface NodeFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
  readdirSync(path: string): string[];
}
const fsSpecifier = 'node:fs';
const { existsSync, readFileSync, readdirSync } = (await import(/* @vite-ignore */ fsSpecifier)) as unknown as NodeFs;

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

/**
 * Where importFromDisc caches exports. WORKBENCH_EXPORT_CACHE points it
 * elsewhere, which is also how this runs on Windows.
 */
const CACHE =
  env('WORKBENCH_EXPORT_CACHE') ??
  `${env('HOME') ?? ''}/Library/Application Support/org.aristotlereader.workbench/corpus/disc-export/lines/Diogenes-Resources/xml/tlg`;

const available = CACHE.length > 0 && existsSync(CACHE);
const when = available ? describe : describe.skip;

when('every cached disc export', () => {
  const files = available
    ? readdirSync(CACHE).filter((f) => f.endsWith('.xml') && f !== 'authtab.xml').sort()
    : [];

  it('imports without a single unusable citation', () => {
    const failures: string[] = [];
    let imported = 0;

    for (const file of files) {
      try {
        const doc = parseTeiRows(readFileSync(`${CACHE}/${file}`, 'utf8'));
        if (doc.rows.length === 0) {
          failures.push(`${file}: parsed to no rows`);
          continue;
        }
        createSourceImport({ title: doc.title || file, rows: doc.rows, levelNames: doc.levelNames });
        imported += 1;
      } catch (err) {
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    expect(failures).toEqual([]);
    expect(imported).toBe(files.length);
  }, 60_000);

  it('gives Bekker-style addresses, not one row per page', () => {
    // Verse mode is the default precisely so this holds; if the cache were
    // built in prose mode the addresses would lose their line numbers.
    const doc = parseTeiRows(readFileSync(`${CACHE}/${files[0]}`, 'utf8'));
    expect(doc.levelNames.length).toBeGreaterThanOrEqual(2);
    expect(doc.rows.length).toBeGreaterThan(100);
  });
});

/**
 * The outline, end to end on real exports.
 *
 * createSourceImport's own tests prove it marks a title row as a header; they
 * say nothing about whether the header survives into the text the app writes
 * to disk. It is that serialized string, not the object, that the rail reads
 * back — so this walks the whole cache and checks the file the app would have
 * written.
 */
when('the outline an import writes', () => {
  const files = available
    ? readdirSync(CACHE).filter((f) => f.endsWith('.xml') && f !== 'authtab.xml').sort()
    : [];

  it('emits a headers line for every work whose edition prints titles', () => {
    const missing: string[] = [];
    let withTitles = 0;

    for (const file of files) {
      const doc = parseTeiRows(readFileSync(`${CACHE}/${file}`, 'utf8'));
      if (doc.rows.length === 0) continue;
      const titled = doc.rows.filter((r) => /^\d*t$/.test(r.ref.split('.').pop() ?? ''));
      if (titled.length === 0) continue;
      withTitles += 1;

      const { file: chapterFile } = createSourceImport({
        title: doc.title || file,
        rows: doc.rows,
        levelNames: doc.levelNames,
      });
      const text = serializeChapterFile(chapterFile);
      if (!/^headers: /m.test(text)) missing.push(`${file}: ${titled.length} title rows, no headers line`);
    }

    expect(missing).toEqual([]);
    expect(withTitles).toBeGreaterThan(0);
  }, 60_000);
});

/**
 * And the rail's half of it: a written file, read back the way the app reads
 * it, has to produce outline roots. The headers line surviving serialization
 * proves nothing if hydration drops the marks or the imported work's profile
 * leaves them un-navigable.
 */
when('the outline an import writes', () => {
  const files = available
    ? readdirSync(CACHE).filter((f) => f.endsWith('.xml') && f !== 'authtab.xml').sort()
    : [];

  it('reads back as outline roots, one per printed title', () => {
    const wrong: string[] = [];
    let checked = 0;

    for (const file of files) {
      const doc = parseTeiRows(readFileSync(`${CACHE}/${file}`, 'utf8'));
      if (doc.rows.length === 0) continue;
      const titled = doc.rows.filter((r) => /^\d*t$/.test(r.ref.split('.').pop() ?? ''));
      if (titled.length === 0) continue;
      checked += 1;

      const { work, file: chapterFile } = createSourceImport({
        title: doc.title || file,
        rows: doc.rows,
        levelNames: doc.levelNames,
      });
      const reread = parseChapterFile(serializeChapterFile(chapterFile));
      const rows = hydrateFromFile(reread, [], work.scheme).rows;
      const profile = work.levels ? { levels: work.levels } : DEFAULT_PROFILE;
      const outline = buildOutline(rows, profile);
      if (outline.length !== titled.length) {
        wrong.push(`${file}: ${titled.length} titles, ${outline.length} outline items`);
      } else if (outline.some((it) => it.label.trim().length === 0)) {
        wrong.push(`${file}: an outline item has no label`);
      }
    }

    expect(wrong).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  }, 60_000);
});
