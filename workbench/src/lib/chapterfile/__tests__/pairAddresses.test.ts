/**
 * Addresses that contain a comma — "205a.25,29", a line the TLG's edition
 * numbers twice. They import fine; the question these tests answer is whether
 * the file survives being written and read back, which is the whole life of a
 * saved work.
 */
import { describe, expect, it } from 'vitest';
import { ChapterFileError, parseChapterFile, serializeChapterFile } from '../index';
import type { ChapterFile } from '../types';

function importedFile(refs: string[]): ChapterFile {
  return {
    meta: {
      schemaVersion: 1,
      work: 'physica',
      book: 1,
      chapter: 1,
      citationScheme: 'source-ref',
      spanStart: refs[0],
      spanEnd: refs[refs.length - 1],
      rowRefs: refs,
    },
    greekLines: refs.map((_, i) => `γραμμή ${i + 1}`),
    englishLines: refs.map(() => ''),
    footnotes: [],
  };
}

describe('addresses with a comma in them', () => {
  const REFS = ['184a.10', '205a.25,29', '184b.110/111', '267b.26'];

  it('round-trips a comma-bearing address', () => {
    const text = serializeChapterFile(importedFile(REFS));
    expect(parseChapterFile(text).meta.rowRefs).toEqual(REFS);
  });

  it('escapes the comma rather than joining raw', () => {
    const text = serializeChapterFile(importedFile(REFS));
    expect(text).toContain('205a.25%2C29');
  });

  it('leaves an address with no comma exactly as it was', () => {
    const plain = ['184a.10', '184a.11'];
    expect(serializeChapterFile(importedFile(plain))).toContain('row_refs: "184a.10,184a.11"');
  });

  it('reads back a file written before the escape, rejoining the split pieces', () => {
    // What the app wrote on disk until now: the comma joined raw, so "25,29"
    // came back as an address and a stray number.
    const legacy = serializeChapterFile(importedFile(REFS)).replace('205a.25%2C29', '205a.25,29');
    expect(parseChapterFile(legacy).meta.rowRefs).toEqual(REFS);
  });

  it('still refuses a file whose refs genuinely do not match its rows', () => {
    const file = importedFile(REFS);
    const text = serializeChapterFile(file).replace('γραμμή 4\n', '');
    expect(() => parseChapterFile(text)).toThrow(ChapterFileError);
  });

  it('carries a comma-bearing address through line_splits too', () => {
    const file = importedFile(REFS);
    file.meta.lineSplits = [{ ref: '205a.25,29', offset: 4 }];
    const reread = parseChapterFile(serializeChapterFile(file));
    expect(reread.meta.lineSplits).toEqual([{ ref: '205a.25,29', offset: 4 }]);
  });
});
