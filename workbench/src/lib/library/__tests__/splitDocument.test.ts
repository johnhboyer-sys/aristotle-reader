import { describe, expect, it } from 'vitest';
import { splitDocument } from '../splitDocument';
import { parseChapterFile, serializeChapterFile } from '../../chapterfile';
import type { ChapterFile, Footnote, HeaderMark } from '../../chapterfile';
import type { WorkProfile } from '../../works/profile';

// level 1 = Part (book), 2 = Question (chapter), 3 = Article (in-page heading)
const PROFILE: WorkProfile = {
  levels: [
    { name: 'Part', navRole: 'book', depth: 0 },
    { name: 'Question', navRole: 'chapter', depth: 1 },
    { name: 'Article', navRole: 'heading', depth: 2 },
  ],
};

interface DocOpts {
  headers?: HeaderMark[];
  english?: string[];
  footnotes?: Footnote[];
  englishPara?: string[];
  paragraphStarts?: number[];
  lineSplits?: { ref: string; offset: number }[];
  scheme?: 'paragraph' | 'plain-line';
}

// Ordinal prefix per document scheme (via a map, not a scheme-id comparison —
// see schemeIdIsolation.test.ts).
const ORDINAL_PREFIX: Record<'paragraph' | 'plain-line', string> = { paragraph: '¶', 'plain-line': '' };

function docFile(rows: string[], opts: DocOpts = {}): ChapterFile {
  const n = rows.length;
  const scheme = opts.scheme ?? 'paragraph';
  const addr = (i: number) => `${ORDINAL_PREFIX[scheme]}${i}`;
  return {
    meta: {
      schemaVersion: 1,
      work: 'summa',
      book: 1,
      chapter: 1,
      citationScheme: scheme,
      spanStart: addr(1),
      spanEnd: addr(n),
      ...(opts.lineSplits ? { lineSplits: opts.lineSplits } : {}),
      ...(opts.paragraphStarts ? { paragraphStarts: opts.paragraphStarts } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
    },
    greekLines: rows,
    englishLines: opts.english ?? rows.map(() => ''),
    ...(opts.englishPara ? { englishParaLines: opts.englishPara } : {}),
    footnotes: opts.footnotes ?? [],
  };
}

const key = (p: { book: number; chapter: number }) => `${p.book}.${p.chapter}`;

describe('splitDocument — partition', () => {
  it('no book/chapter markers → a single 1.1 part mirroring the input', () => {
    const file = docFile(['a', 'b', 'c'], { headers: [{ row: 2, level: 3 }] }); // an Article (heading) only
    const parts = splitDocument(file, PROFILE);
    expect(parts).toHaveLength(1);
    expect(key(parts[0])).toBe('1.1');
    expect(parts[0].file.greekLines).toEqual(['a', 'b', 'c']);
    expect(parts[0].file.meta.headers).toEqual([{ row: 2, level: 3 }]);
    expect(parts[0].file.meta.spanStart).toBe('¶1');
    expect(parts[0].file.meta.spanEnd).toBe('¶3');
  });

  it('a chapter marker after a preface → preface 1.1, then 1.2 (chapter++ over the preface)', () => {
    // rows: 0,1 preface; row 2 is a Question (chapter) boundary.
    const file = docFile(['pre1', 'pre2', 'Q', 'body'], { headers: [{ row: 3, level: 2 }] });
    const parts = splitDocument(file, PROFILE);
    expect(parts.map(key)).toEqual(['1.1', '1.2']);
    expect(parts[0].file.greekLines).toEqual(['pre1', 'pre2']);
    expect(parts[1].file.greekLines).toEqual(['Q', 'body']);
    // the boundary row is the first row of the new part, re-based to local row 1
    expect(parts[1].file.meta.headers).toEqual([{ row: 1, level: 2 }]);
    expect(parts[1].file.meta.spanStart).toBe('¶1');
    expect(parts[1].file.meta.spanEnd).toBe('¶2');
  });

  it('a boundary on the very first row just labels the first part (no bump)', () => {
    const file = docFile(['Q1', 'a', 'Q2', 'b'], {
      headers: [
        { row: 1, level: 2 },
        { row: 3, level: 2 },
      ],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts.map(key)).toEqual(['1.1', '1.2']);
    expect(parts[0].file.greekLines).toEqual(['Q1', 'a']);
    expect(parts[1].file.greekLines).toEqual(['Q2', 'b']);
  });

  it('a book marker opens a new book and resets chapter', () => {
    const file = docFile(['P1', 'Q1', 'x', 'P2', 'Q1b'], {
      headers: [
        { row: 1, level: 1 }, // Part (book) on first row → book 1
        { row: 2, level: 2 }, // Question → 1.2
        { row: 4, level: 1 }, // Part → book 2
        { row: 5, level: 2 }, // Question → 2.2
      ],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts.map(key)).toEqual(['1.1', '1.2', '2.1', '2.2']);
    expect(parts.map((p) => p.file.greekLines)).toEqual([['P1'], ['Q1', 'x'], ['P2'], ['Q1b']]);
  });

  it('a chapter before any book stays in book 1', () => {
    const file = docFile(['a', 'Q', 'b'], { headers: [{ row: 2, level: 2 }] });
    const parts = splitDocument(file, PROFILE);
    expect(parts.map(key)).toEqual(['1.1', '1.2']);
  });

  it('consecutive boundary rows each make a valid one-row part', () => {
    const file = docFile(['Q1', 'Q2', 'Q3'], {
      headers: [
        { row: 1, level: 2 },
        { row: 2, level: 2 },
        { row: 3, level: 2 },
      ],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts.map(key)).toEqual(['1.1', '1.2', '1.3']);
    expect(parts.map((p) => p.file.greekLines)).toEqual([['Q1'], ['Q2'], ['Q3']]);
  });
});

describe('splitDocument — re-basing per part', () => {
  it('scopes footnotes to the part whose [ENGLISH] carries the marker', () => {
    const file = docFile(['Q1', 'a', 'Q2', 'b'], {
      headers: [
        { row: 1, level: 2 },
        { row: 3, level: 2 },
      ],
      english: ['', 'see {^1:note one}', '', 'see {^2:note two}'],
      footnotes: [
        { id: 1, body: 'note one' },
        { id: 2, body: 'note two' },
      ],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts[0].file.footnotes).toEqual([{ id: 1, body: 'note one' }]);
    expect(parts[1].file.footnotes).toEqual([{ id: 2, body: 'note two' }]);
  });

  it('keeps a footnote anchored in two parts in each part', () => {
    const file = docFile(['Q1', 'x', 'Q2', 'y'], {
      headers: [
        { row: 1, level: 2 },
        { row: 3, level: 2 },
      ],
      english: ['{^1:shared}', '', '{^1:shared}', ''],
      footnotes: [{ id: 1, body: 'shared' }],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts[0].file.footnotes).toEqual([{ id: 1, body: 'shared' }]);
    expect(parts[1].file.footnotes).toEqual([{ id: 1, body: 'shared' }]);
  });

  it('slices englishPara and omits an all-empty section', () => {
    const file = docFile(['Q1', 'a', 'Q2', 'b'], {
      headers: [
        { row: 1, level: 2 },
        { row: 3, level: 2 },
      ],
      englishPara: ['para one', 'more', '', ''],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts[0].file.englishParaLines).toEqual(['para one', 'more']);
    expect(parts[1].file.englishParaLines).toBeUndefined(); // all empty → dropped
  });

  it('re-bases line_splits refs and drops out-of-part ones', () => {
    const file = docFile(['Q1', 'a', 'Q2', 'b'], {
      headers: [
        { row: 1, level: 2 },
        { row: 3, level: 2 },
      ],
      lineSplits: [
        { ref: '¶2', offset: 3 }, // in part 1 (rows 1-2) → local ¶2
        { ref: '¶4', offset: 5 }, // in part 2 (rows 3-4) → local ¶2
      ],
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts[0].file.meta.lineSplits).toEqual([{ ref: '¶2', offset: 3 }]);
    expect(parts[1].file.meta.lineSplits).toEqual([{ ref: '¶2', offset: 5 }]);
  });

  it('re-bases paragraph_starts to local ordinals (plain-line scheme)', () => {
    const file = docFile(['Q1', 'a', 'b', 'Q2', 'c'], {
      scheme: 'plain-line',
      headers: [
        { row: 1, level: 2 },
        { row: 4, level: 2 },
      ],
      paragraphStarts: [1, 3, 4, 5], // 1,3 in part1 (rows1-3); 4,5 in part2 (rows4-5)
    });
    const parts = splitDocument(file, PROFILE);
    expect(parts[0].file.meta.paragraphStarts).toEqual([1, 3]);
    expect(parts[1].file.meta.paragraphStarts).toEqual([1, 2]); // 4→1, 5→2
  });
});

describe('splitDocument — every part round-trips through the chapter-file format', () => {
  it('serialize → parse is stable for each part', () => {
    const file = docFile(['P1', 'Q1', 'a', 'Q2', 'b'], {
      headers: [
        { row: 1, level: 1 },
        { row: 2, level: 2 },
        { row: 3, level: 3 },
        { row: 4, level: 2 },
      ],
      english: ['', 'q one {^1:note}', 'art', '', 'body'],
      footnotes: [{ id: 1, body: 'note' }],
    });
    for (const part of splitDocument(file, PROFILE)) {
      const text = serializeChapterFile(part.file);
      const reparsed = parseChapterFile(text, `part-${key(part)}`);
      expect(reparsed.meta.book).toBe(part.book);
      expect(reparsed.meta.chapter).toBe(part.chapter);
      expect(reparsed.greekLines).toEqual(part.file.greekLines);
      expect(reparsed.meta.headers).toEqual(part.file.meta.headers);
      expect(reparsed.footnotes).toEqual(part.file.footnotes);
      // byte-stable
      expect(serializeChapterFile(reparsed)).toBe(text);
    }
  });
});
