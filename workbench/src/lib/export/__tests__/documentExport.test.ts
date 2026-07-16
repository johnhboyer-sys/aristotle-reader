import { describe, expect, it } from 'vitest';
import { documentCompileInput } from '../documentExport';
import type { ChapterFile, HeaderMark } from '../../chapterfile/types';
import type { WorkManifest } from '../../works/manifest';

// Part (book) / Question (chapter) / Article (heading) — same profile the Summa uses.
const WORK: WorkManifest = {
  id: 'summa',
  title: 'Summa Theologiae',
  author: '',
  scheme: 'paragraph',
  books: [{ n: 1, label: '' }],
  profile: {
    levels: [
      { name: 'Part', navRole: 'book', depth: 0 },
      { name: 'Question', navRole: 'chapter', depth: 1 },
      { name: 'Article', navRole: 'heading', depth: 2 },
    ],
  },
};

function docFile(rows: string[], headers: HeaderMark[]): ChapterFile {
  return {
    meta: {
      schemaVersion: 1,
      work: 'summa',
      book: 1,
      chapter: 1,
      citationScheme: 'paragraph',
      spanStart: '¶1',
      spanEnd: `¶${rows.length}`,
      ...(headers.length > 0 ? { headers } : {}),
    },
    greekLines: rows,
    englishLines: rows.map(() => ''),
    footnotes: [],
  };
}

describe('documentCompileInput — split a marker-driven document for export', () => {
  it('no Book/Chapter marks → one part, work unchanged (byte-identical single doc)', () => {
    const file = docFile(['Body a', 'Body b'], [{ row: 1, level: 3 }]); // an Article (heading) only
    const out = documentCompileInput(file, WORK);
    expect(out.chapters).toHaveLength(1);
    expect(out.work).toBe(WORK); // untouched
    expect((out.work as WorkManifest).documentBooks).toBeUndefined();
  });

  it('chapter marks → one part per chapter, labels taken from the marked lines', () => {
    // row 1 preface, row 2 "Question 2" (chapter), row 3 "Question 3" (chapter)
    const file = docFile(['Preface', 'Question 2', 'Question 3'], [
      { row: 2, level: 2 },
      { row: 3, level: 2 },
    ]);
    const out = documentCompileInput(file, WORK);
    expect(out.chapters.map((c) => `${c.meta.book}.${c.meta.chapter}`)).toEqual(['1.1', '1.2', '1.3']);
    const dbs = (out.work as WorkManifest).documentBooks;
    expect(dbs).toEqual([
      {
        n: 1,
        label: 'Book 1',
        chapters: [
          { n: 1, label: 'Chapter 1' }, // preface, unmarked → default
          { n: 2, label: 'Question 2' }, // from the marked line's text
          { n: 3, label: 'Question 3' },
        ],
      },
    ]);
  });

  it('book + chapter marks → named Books derived from the text', () => {
    const file = docFile(['Prima Pars', 'Question 2', 'Secunda Pars', 'Question 1'], [
      { row: 1, level: 1 },
      { row: 2, level: 2 },
      { row: 3, level: 1 },
      { row: 4, level: 2 },
    ]);
    const out = documentCompileInput(file, WORK);
    const dbs = (out.work as WorkManifest).documentBooks;
    expect(dbs?.map((b) => b.label)).toEqual(['Prima Pars', 'Secunda Pars']);
  });
});
