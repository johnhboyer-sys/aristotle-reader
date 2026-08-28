/**
 * The divisions matcher against the real thing: this repo's own Physics
 * chapter table, and the Physics as Diogenes actually exports it.
 *
 * Hand-written rows would only prove the rules I already believe. What decides
 * whether a translator has to mark 71 chapters by hand is whether every one of
 * those addresses lands on a row of the real export — including the seven
 * places where the OCT's line numbering doubles back on itself.
 *
 * Self-skipping: both inputs are local artefacts (the disc-export cache and
 * the built divisions table), so a machine without them is a normal machine.
 */
import { describe, expect, it } from 'vitest';
import { parseTeiRows } from '../../corpus/teiRows';
import { createSourceImport } from '../../import/createSourceImport';
import { divisionsForDiscWork, divisionsToContainers, rowForAddress } from '../divisions';
import type { DivisionsTable } from '../divisions';

const fsSpecifier = 'node:fs';
const { existsSync, readFileSync } = (await import(/* @vite-ignore */ fsSpecifier)) as unknown as {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
};

function env(name: string): string | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];
}

const CACHE =
  env('WORKBENCH_EXPORT_CACHE') ??
  `${env('HOME') ?? ''}/Library/Application Support/org.aristotlereader.workbench/corpus/disc-export/lines/Diogenes-Resources/xml/tlg`;
const PHYSICS = `${CACHE}/tlg0086031.xml`;
const TABLE = new URL('../../../../.dev-corpus/divisions.json', import.meta.url).pathname;

/** The text of each marked title row — what names the Books. */
function rootTexts(file: { meta: { headers?: { row: number }[] }; greekLines: string[] }): string[] {
  return (file.meta.headers ?? []).map((mark) => file.greekLines[mark.row - 1] ?? '');
}

const available = existsSync(PHYSICS) && existsSync(TABLE);
const when = available ? describe : describe.skip;

when('the Physics, divided from the table', () => {
  const table = available ? (JSON.parse(readFileSync(TABLE, 'utf8')) as DivisionsTable) : null;
  const doc = available ? parseTeiRows(readFileSync(PHYSICS, 'utf8')) : null;

  it('finds the work by the ids the disc importer already has', () => {
    const divisions = divisionsForDiscWork(table, 'TLG0086', '031');
    expect(divisions?.id).toBe('Phys');
    expect(divisions?.books).toHaveLength(8);
    expect(divisions?.chapters).toHaveLength(71);
  });

  it('lands every one of the 71 chapters on a row of the real export', () => {
    const divisions = divisionsForDiscWork(table, 'TLG0086', '031')!;
    const { file } = createSourceImport({
      title: doc!.title || 'Physica',
      rows: doc!.rows,
      levelNames: doc!.levelNames,
    });
    const refs = file.meta.rowRefs!;
    const applied = divisionsToContainers(divisions, refs, rootTexts(file));

    expect(applied.unmatched).toEqual([]);
    expect(applied.chapters).toHaveLength(71);
    // Eight title rows, eight books: the hierarchy is laid down, and each Book
    // is named the way its own title line names it.
    expect(applied.books.map((b) => b.start)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(applied.books.map((b) => b.label)).toEqual([
      'Book Α', 'Book Β', 'Book Γ', 'Book Δ', 'Book Ε', 'Book Ζ', 'Book Η', 'Book Θ',
    ]);

    // Book 1 chapter 1 opens the work at 184a10, which IS the first text row —
    // the row a mark would have swallowed.
    expect(applied.chapters[0].row).toBe(2);
    expect(refs[applied.chapters[0].row - 1]).toBe('184a.10');
    // Every boundary points at the row whose address the table names.
    for (const chapter of divisions.chapters) {
      const container = applied.chapters.find(
        (c) => refs[c.row - 1].startsWith(`${chapter.column}.${chapter.line}`),
      );
      expect(container, `${chapter.column}${chapter.line}`).toBeDefined();
    }
  });

  it('holds the boundaries in document order, one row apiece', () => {
    const divisions = divisionsForDiscWork(table, 'TLG0086', '031')!;
    const { file } = createSourceImport({ title: 'Physica', rows: doc!.rows, levelNames: doc!.levelNames });
    const { chapters } = divisionsToContainers(divisions, file.meta.rowRefs!, rootTexts(file));
    const rows = chapters.map((c) => c.row);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('reports a chapter it cannot place instead of pointing at the wrong line', () => {
    const refs = ['184a.10', '184a.11'];
    expect(rowForAddress(refs, '999b', 4)).toBeNull();
    const divisions = { ...divisionsForDiscWork(table, 'TLG0086', '031')!, chapters: [
      { book: 1, n: 1, column: '184a', line: 10 },
      { book: 9, n: 1, column: '999b', line: 4 },
    ] };
    const applied = divisionsToContainers(divisions, refs, []);
    expect(applied.chapters).toHaveLength(1);
    expect(applied.unmatched).toEqual([{ book: 9, n: 1, column: '999b', line: 4 }]);
  });

  it('withholds the Books when the export prints a different number of titles', () => {
    const divisions = divisionsForDiscWork(table, 'TLG0086', '031')!;
    const { file } = createSourceImport({ title: 'Physica', rows: doc!.rows, levelNames: doc!.levelNames });
    // Three roots against eight books: a hierarchy built on that would be a
    // coincidence, so the chapters land and the Books do not.
    const applied = divisionsToContainers(divisions, file.meta.rowRefs!, ['Α', 'Β', 'Γ']);
    expect(applied.books).toEqual([]);
    expect(applied.chapters).toHaveLength(71);
  });
});

when('labels carry what the hierarchy cannot', () => {
  const table = available ? (JSON.parse(readFileSync(TABLE, 'utf8')) as DivisionsTable) : null;

  it('names a chapter by its book when the Books cannot be laid down', () => {
    // The Ethics prints ONE title line for ten books, so it gets no Book
    // containers — and its chapters read "2.3", the citation, rather than ten
    // separate runs of "Chapter 1".
    const divisions = divisionsForDiscWork(table, 'TLG0086', '010');
    if (!divisions) return; // that work isn't in this cache
    const refs = ['1094a.1', '1103a.14'];
    const applied = divisionsToContainers(divisions, refs, ['ΗΘΙΚΩΝ ΝΙΚΟΜΑΧΕΙΩΝ Α']);
    expect(applied.books).toEqual([]);
    expect(applied.chapters.every((c) => /^\d+\.\d+$/.test(c.label))).toBe(true);
  });

  it('names it plainly when its Book is the container above it', () => {
    const divisions = divisionsForDiscWork(table, 'TLG0086', '031')!;
    const applied = divisionsToContainers(divisions, ['184a.10'], ['ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α', 'Β.', 'Γ.', 'Δ.', 'Ε.', 'Ζ.', 'Η.', 'Θ.']);
    expect(applied.books).toHaveLength(8);
    expect(applied.chapters[0].label).toBe('Chapter 1');
  });
});
