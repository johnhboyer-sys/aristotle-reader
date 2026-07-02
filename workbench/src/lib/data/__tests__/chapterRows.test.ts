import { describe, expect, it } from 'vitest';
import { bookChapterNumbers, chapterForEditor, chapterRows } from '../chapterRows';
import type { WorkCorpus } from '../corpusStore';
import type { WorkManifest } from '../../works/manifest';
import type { ChapterEntry } from '../../corpus/chapters';

// SYNTHETIC fixture only — fake-Greek-looking placeholder text, no TLG-derived
// text (copyright guard: workbench/ must never carry real corpus text).

const work: WorkManifest = {
  id: 'test-work',
  title: 'Test Work',
  author: 'Testotle',
  scheme: 'bekker-standard',
  books: [
    { n: 1, label: 'Α' },
    { n: 2, label: 'Β' },
  ],
};

/**
 * Two books in spine document order:
 *   book 1: 10a1..10a5, 10b1..10b3   (8 lines)
 *   book 2: 11a1..11a4               (4 lines)
 * Chapters:
 *   1.1 anchors 10a1 (line start)
 *   1.2 anchors 10a4 at wordIndex 2 (MID-LINE: 1.1 keeps all of 10a4,
 *       1.2 begins at the following line 10a5) and is the LAST chapter of
 *       book 1 (next anchor is book 2's first chapter)
 *   2.1 anchors 11a1 and is the last chapter of the work (runs to work end)
 */
function makeCorpus(): WorkCorpus {
  const seg = (id: string, book: number, column: string, ns: number[]) => ({
    id,
    book,
    column,
    lines: ns.map((n) => ({ n, text: `κειμενον ${column}${n}` })),
  });
  const chapters: ChapterEntry[] = [
    { book: 1, chapter: '1', column: '10a', line: '1', wordIndex: 0, bookstart: true },
    { book: 1, chapter: '2', column: '10a', line: '4', wordIndex: 2, bookstart: false },
    { book: 2, chapter: '1', column: '11a', line: '1', wordIndex: 0, bookstart: true },
  ];
  return {
    spine: {
      work: 'Test',
      edition: 'Test Edition',
      segments: [
        seg('1:10a', 1, '10a', [1, 2, 3, 4, 5]),
        seg('1:10b', 1, '10b', [1, 2, 3]),
        seg('2:11a', 2, '11a', [1, 2, 3, 4]),
      ],
      headings: [],
      unassigned_lines: [],
    },
    chapters,
  };
}

describe('chapterRows', () => {
  it('slices from the chapter anchor to the line before the next anchor', () => {
    const result = chapterRows(work, makeCorpus(), 1, 1);
    expect(result).not.toBeNull();
    // Next chapter (1.2) starts MID-LINE at 10a4 → this chapter keeps 10a4.
    expect(result!.rows.map((r) => r.address.raw)).toEqual(['10a1', '10a2', '10a3', '10a4']);
    expect(result!.spanStart).toEqual({ scheme: 'bekker-standard', raw: '10a1' });
    expect(result!.spanEnd).toEqual({ scheme: 'bekker-standard', raw: '10a4' });
    expect(result!.rows[0].greek).toBe('κειμενον 10a1');
  });

  it('starts a mid-line chapter at the FOLLOWING line and runs to book end', () => {
    // 1.2 anchors 10a4 word 2 → begins at 10a5; last chapter of book 1 →
    // ends the line before book 2's first anchor, i.e. at 10b3.
    const result = chapterRows(work, makeCorpus(), 1, 2);
    expect(result!.rows.map((r) => r.address.raw)).toEqual(['10a5', '10b1', '10b2', '10b3']);
    expect(result!.spanStart.raw).toBe('10a5');
    expect(result!.spanEnd.raw).toBe('10b3');
  });

  it('never duplicates or drops a line across a mid-line boundary', () => {
    const corpus = makeCorpus();
    const one = chapterRows(work, corpus, 1, 1)!.rows.map((r) => r.address.raw);
    const two = chapterRows(work, corpus, 1, 2)!.rows.map((r) => r.address.raw);
    const all = [...one, ...two];
    expect(all).toEqual(['10a1', '10a2', '10a3', '10a4', '10a5', '10b1', '10b2', '10b3']);
    expect(new Set(all).size).toBe(all.length);
  });

  it('runs the last chapter of the work to the spine end', () => {
    const result = chapterRows(work, makeCorpus(), 2, 1);
    expect(result!.rows.map((r) => r.address.raw)).toEqual(['11a1', '11a2', '11a3', '11a4']);
  });

  it('stamps every row address with the work scheme', () => {
    const result = chapterRows(work, makeCorpus(), 2, 1)!;
    for (const row of result.rows) expect(row.address.scheme).toBe('bekker-standard');
  });

  it('returns null for a chapter the corpus does not have', () => {
    expect(chapterRows(work, makeCorpus(), 1, 3)).toBeNull();
    expect(chapterRows(work, makeCorpus(), 3, 1)).toBeNull();
  });

  it('returns null (not garbage) when an anchor is missing from the spine', () => {
    const corpus = makeCorpus();
    corpus.chapters[0] = { ...corpus.chapters[0], column: '99a' };
    expect(chapterRows(work, corpus, 1, 1)).toBeNull();
  });
});

describe('bookChapterNumbers', () => {
  it('lists chapter numbers per book in corpus order', () => {
    const corpus = makeCorpus();
    expect(bookChapterNumbers(corpus, 1)).toEqual([1, 2]);
    expect(bookChapterNumbers(corpus, 2)).toEqual([1]);
    expect(bookChapterNumbers(corpus, 3)).toEqual([]);
  });
});

describe('chapterForEditor', () => {
  it('builds the editor chapter shape with label and collapsed range', () => {
    const chapter = chapterForEditor(work, makeCorpus(), 1, 1)!;
    expect(chapter.workId).toBe('test-work');
    expect(chapter.workTitle).toBe('Test Work');
    expect(chapter.scheme).toBe('bekker-standard');
    expect(chapter.book).toBe(1);
    expect(chapter.bookLabel).toBe('Α');
    expect(chapter.chapter).toBe(1);
    expect(chapter.bekkerRange).toBe('10a1–4'); // same-column collapse
    expect(chapter.lines).toHaveLength(4);
    expect(chapter.lines[0].address.raw).toBe('10a1');
  });

  it('formats a cross-column span without collapsing the side', () => {
    const chapter = chapterForEditor(work, makeCorpus(), 1, 2)!;
    expect(chapter.bekkerRange).toBe('10a5–b3');
  });

  it('is null for an unavailable chapter', () => {
    expect(chapterForEditor(work, makeCorpus(), 1, 9)).toBeNull();
  });
});
