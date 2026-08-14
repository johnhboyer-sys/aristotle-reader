// The shared core all three source importers feed. What matters here is that
// the SOURCE's citations survive onto the rows unchanged — that is the whole
// point of importing from a cited edition instead of pasting text — and that
// the file it builds round-trips through the chapter-file parser.
import { describe, expect, it } from 'vitest';
import { createSourceImport } from '../createSourceImport';
import type { SourceRow } from '../createSourceImport';
import { parseChapterFile, serializeChapterFile } from '../../chapterfile';
import { rowAddressSource } from '../../library/autosave';
import { getScheme } from '../../citation/registry';

const rows: SourceRow[] = [
  { ref: '1.1', text: 'Ἀρετῆς πέρι λέγομεν' },
  { ref: '1.2', text: 'δεύτερος στίχος' },
  { ref: '2.1', text: 'ἄλλο βιβλίον' },
];

describe('createSourceImport', () => {
  it('carries every source citation onto its row, verbatim', () => {
    const { file } = createSourceImport({ title: 'Imported Text', rows });
    expect(file.meta.rowRefs).toEqual(['1.1', '1.2', '2.1']);
    expect(file.meta.spanStart).toBe('1.1');
    expect(file.meta.spanEnd).toBe('2.1');
  });

  it('does NOT renumber rows by position', () => {
    // The failure this guards: treating the third row as "3" because it is
    // third, which is what the plain-line path does and what would silently
    // destroy the citation.
    const { file } = createSourceImport({ title: 'Imported Text', rows });
    expect(file.meta.rowRefs?.[2]).toBe('2.1');
  });

  it('uses the source-ref scheme for both the work and the file', () => {
    const { work, file } = createSourceImport({ title: 'Imported Text', rows });
    expect(work.scheme).toBe('source-ref');
    expect(file.meta.citationScheme).toBe('source-ref');
  });

  it('pairs each row with an empty untranslated English row', () => {
    const { file } = createSourceImport({ title: 'Imported Text', rows });
    expect(file.englishLines).toHaveLength(file.greekLines.length);
  });

  it('drops rows whose text is blank, and their citations with them', () => {
    const withBlanks: SourceRow[] = [
      { ref: '1.1', text: 'real text' },
      { ref: '1.2', text: '   ' },
      { ref: '1.3', text: 'more text' },
    ];
    const { file } = createSourceImport({ title: 'T', rows: withBlanks });
    expect(file.greekLines).toEqual(['real text', 'more text']);
    expect(file.meta.rowRefs).toEqual(['1.1', '1.3']);
  });

  it('keeps non-ascending citations rather than refusing the import', () => {
    // Transposed fragments and appendices are real; order is file order.
    const jumbled: SourceRow[] = [
      { ref: '2.1', text: 'first in the file' },
      { ref: '1.1', text: 'second in the file' },
    ];
    const { file } = createSourceImport({ title: 'T', rows: jumbled });
    expect(file.meta.rowRefs).toEqual(['2.1', '1.1']);
  });
});

describe('work record', () => {
  it('names the outline tiers after the source levels, nested', () => {
    const { work } = createSourceImport({
      title: 'T',
      rows,
      levelNames: ['book', 'line'],
    });
    expect(work.levels).toEqual([
      { name: 'book', navRole: 'heading', depth: 0 },
      { name: 'line', navRole: 'heading', depth: 1 },
    ]);
  });

  it('omits levels when the source declares none', () => {
    const { work } = createSourceImport({ title: 'T', rows });
    expect(work.levels).toBeUndefined();
  });

  it('carries author and language when given, omits them when not', () => {
    const withMeta = createSourceImport({ title: 'T', author: 'Plato', language: 'Greek', rows });
    expect(withMeta.work.author).toBe('Plato');
    expect(withMeta.work.language).toBe('Greek');
    const without = createSourceImport({ title: 'T', rows });
    expect(without.work.author).toBeUndefined();
    expect(without.work.language).toBeUndefined();
  });

  it('gives the work an id derived from the title, unique against existing ids', () => {
    const first = createSourceImport({ title: 'De Anima', rows });
    expect(first.work.id).toBe('de-anima');
    const second = createSourceImport({ title: 'De Anima', rows }, ['de-anima']);
    expect(second.work.id).not.toBe('de-anima');
  });
});

describe('refusals', () => {
  it('refuses a blank title', () => {
    expect(() => createSourceImport({ title: '  ', rows })).toThrow(/title/i);
  });

  it('refuses a source with no text at all', () => {
    expect(() => createSourceImport({ title: 'T', rows: [{ ref: '1', text: ' ' }] })).toThrow(/no text/i);
  });

  it('refuses an unusable citation instead of guessing at one', () => {
    const bad: SourceRow[] = [{ ref: 'not a ref!', text: 'text' }];
    expect(() => createSourceImport({ title: 'T', rows: bad })).toThrow(/unusable citation/i);
  });
});

describe('round trip', () => {
  it('survives serialize → parse with its citations intact', () => {
    const { file } = createSourceImport({ title: 'T', rows });
    const reparsed = parseChapterFile(serializeChapterFile(file), 'test.md');
    expect(reparsed.meta.rowRefs).toEqual(['1.1', '1.2', '2.1']);
    expect(reparsed.greekLines).toEqual(file.greekLines);
  });

  it('resolves each row to its source address through the normal lookup', () => {
    const { file } = createSourceImport({ title: 'T', rows });
    const reparsed = parseChapterFile(serializeChapterFile(file), 'test.md');
    const addressOf = rowAddressSource(reparsed.meta, [], getScheme('source-ref'));
    expect(addressOf(1).raw).toBe('1.1');
    expect(addressOf(3).raw).toBe('2.1');
  });
});

// Navigation for an imported work. Verified against real Diogenes exports:
// the Physics yields its eight books, De Anima three.
describe('title rows become the outline', () => {
  const rowsOf = (refs: string[]) => refs.map((ref, i) => ({ ref, text: `line ${i}` }));

  it('marks the rows Diogenes numbered as titles', () => {
    const { file } = createSourceImport({
      title: 'Physica',
      rows: [
        { ref: '184a.t', text: 'ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α' },
        { ref: '184a.10', text: 'τῶν' },
        { ref: '192b.8t', text: 'Β.' },
        { ref: '192b.9', text: 'ἐπεὶ' },
      ],
    });
    expect(file.meta.headers).toEqual([{ row: 1, level: 1 }, { row: 3, level: 1 }]);
  });

  it('never marks a content line, which would drop it from the text', () => {
    // A heading renders as a title and leaves the flowing views. Marking the
    // first line of each Bekker page would give an outline and silently lose
    // eight hundred lines of Aristotle.
    const { file } = createSourceImport({ title: 'P', rows: rowsOf(['184a.1', '184b.1', '185a.1']) });
    expect(file.meta.headers).toBeUndefined();
  });

  it('leaves headers off a work with no title rows at all', () => {
    // Perseus texts have none; the field must be absent, not an empty list.
    const { file } = createSourceImport({ title: 'R', rows: rowsOf(['1.327a', '1.327b']) });
    expect('headers' in file.meta).toBe(false);
  });

  it('does not mistake a line number ending in a letter for a title', () => {
    // "25a" is a real line; only "t" (optionally after a number) is a title.
    const { file } = createSourceImport({ title: 'D', rows: rowsOf(['403a.25a', '403a.1n', '403a.26']) });
    expect(file.meta.headers).toBeUndefined();
  });
});
