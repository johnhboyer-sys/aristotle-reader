import { describe, expect, it } from 'vitest';
import {
  buildGapReport,
  compileWorkMarkdown,
  sortChaptersManifestOrder,
} from '../compile';
import { compileDefaultFilename, sanitizeFilenameComponent } from '../index';
import { parseManifest } from '../../works/manifest';
import type { ChapterFile } from '../../chapterfile/types';
import type { WorkMeta } from '../../citation/types';
import metaphysicsYaml from '../../works/manifests/metaphysics.yaml?raw';
import posteriorAnalyticsYaml from '../../works/manifests/posterior-analytics.yaml?raw';

const META = parseManifest(metaphysicsYaml, 'metaphysics.yaml');
const POST_AN = parseManifest(posteriorAnalyticsYaml, 'posterior-analytics.yaml');
const FREE_WORK: WorkMeta = {
  id: 'free-doc',
  title: 'Free Doc',
  author: '',
  scheme: 'paragraph',
  books: [{ n: 1, label: '' }],
};

function metaChapter(book: number, chapter: number, overrides: Partial<ChapterFile> = {}): ChapterFile {
  return {
    meta: {
      schemaVersion: 1,
      work: 'metaphysics',
      book,
      chapter,
      citationScheme: 'bekker-metaphysics',
      spanStart: '1041a6',
      spanEnd: '1041a10',
    },
    greekLines: ['g1', 'g2', 'g3', 'g4', 'g5'],
    englishLines: ['one', 'two', 'three', 'four', 'five'],
    footnotes: [],
    ...overrides,
  };
}

describe('sortChaptersManifestOrder', () => {
  it('orders plain refs by manifest book order, then chapter number', () => {
    const items = [
      { book: 7, chapter: 3 },
      { book: 1, chapter: 5 },
      { book: 7, chapter: 1 },
      { book: 1, chapter: 1 },
    ];
    const sorted = sortChaptersManifestOrder(items, META);
    expect(sorted).toEqual([
      { book: 1, chapter: 1 },
      { book: 1, chapter: 5 },
      { book: 7, chapter: 1 },
      { book: 7, chapter: 3 },
    ]);
  });

  it('accepts a keyOf extractor for non-ref shapes', () => {
    const items = [{ id: 'b', book: 4, chapter: 2 }, { id: 'a', book: 4, chapter: 1 }];
    const sorted = sortChaptersManifestOrder(items, META, (i) => ({ book: i.book, chapter: i.chapter }));
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('unknown book numbers sort after all known books, by book number', () => {
    const items = [
      { book: 99, chapter: 1 },
      { book: 14, chapter: 1 }, // last known book (Ν)
      { book: 1, chapter: 1 },
    ];
    const sorted = sortChaptersManifestOrder(items, META);
    expect(sorted).toEqual([
      { book: 1, chapter: 1 },
      { book: 14, chapter: 1 },
      { book: 99, chapter: 1 },
    ]);
  });
});

describe('buildGapReport', () => {
  it('reports no gaps when every book present is contiguous and books absent entirely are flagged', () => {
    // metaphysics has 14 books; only book 7 (Ζ) has chapters here.
    const present = [
      { book: 7, chapter: 1 },
      { book: 7, chapter: 2 },
      { book: 7, chapter: 3 },
    ];
    const report = buildGapReport(present, META);
    expect(report.hasGaps).toBe(true); // every other book is "missing entirely"
    expect(report.lines).toContain('Α missing entirely');
    expect(report.lines).not.toContain('Ζ missing entirely');
  });

  it('flags a mid-range missing chapter within a book that otherwise has chapters', () => {
    const present = [
      { book: 7, chapter: 1 },
      { book: 7, chapter: 2 },
      // chapter 3 missing
      { book: 7, chapter: 4 },
    ];
    const report = buildGapReport(present, META);
    expect(report.lines).toContain('Ζ missing chapter 3');
  });

  it('flags multiple mid-range missing chapters, comma-joined', () => {
    const present = [
      { book: 4, chapter: 1 },
      { book: 4, chapter: 2 },
      // 3 missing
      { book: 4, chapter: 4 },
      { book: 4, chapter: 5 },
      { book: 4, chapter: 6 },
      // 7 missing
      { book: 4, chapter: 8 },
    ];
    const report = buildGapReport(present, META);
    expect(report.lines).toContain('Γ missing chapters 3, 7');
  });

  it('does not flag chapters beyond the last saved one in a book (no ground-truth chapter count)', () => {
    const present = [{ book: 1, chapter: 1 }, { book: 1, chapter: 2 }];
    const report = buildGapReport(present, META);
    expect(report.lines.some((l) => l.startsWith('Α'))).toBe(false);
  });

  it('summary combines complete-book and gap lines in one compact sentence', () => {
    const present = [
      { book: 1, chapter: 1 }, // Α complete (trivially, only chapter present)
      { book: 4, chapter: 1 },
      { book: 4, chapter: 3 }, // Γ missing chapter 2
    ];
    const report = buildGapReport(present, META);
    expect(report.summary).toContain('missing chapter 2');
    expect(report.hasGaps).toBe(true);
  });

  it('does NOT collapse two non-adjacent complete books into one misleading range (regression: Α and Ζ complete with absent books between them must NOT read "Α–Ζ complete")', () => {
    const present = [
      { book: 1, chapter: 1 }, // Α — only book 1
      { book: 1, chapter: 2 },
      { book: 7, chapter: 5 }, // Ζ — only book 7; α,Β,Γ,Δ,Ε,Η.. all absent between them
    ];
    const report = buildGapReport(present, META);
    expect(report.summary).not.toContain('Α–Ζ');
    expect(report.summary).toContain('Book Α complete');
    expect(report.summary).toContain('Book Ζ complete');
    expect(report.summary).toContain('α missing entirely');
  });

  it('DOES collapse a run of manifest-adjacent complete books into one range clause', () => {
    const present = [
      { book: 1, chapter: 1 }, // Α
      { book: 2, chapter: 1 }, // α (book index 2, immediately after Α)
      { book: 3, chapter: 1 }, // Β (immediately after α)
    ];
    const report = buildGapReport(present, META);
    expect(report.summary).toContain('Books Α–Β complete');
  });

  it('all books fully absent (nothing saved) — every book flagged missing entirely, no "complete" clause', () => {
    const report = buildGapReport([], META);
    expect(report.hasGaps).toBe(true);
    expect(report.summary).not.toContain('complete');
    expect(report.lines.length).toBe(META.books.length);
  });

  it('every book present with no gaps at all yields "All chapters present." only when nothing to list', () => {
    // Not realistic for a 14-book work in a unit test, but exercised via a
    // 1-book manifest-shaped WorkMeta so the "no gaps anywhere" branch is covered.
    const oneBookWork = { ...META, books: [{ n: 1, label: 'Α' }] };
    const present = [{ book: 1, chapter: 1 }, { book: 1, chapter: 2 }];
    const report = buildGapReport(present, oneBookWork);
    expect(report.hasGaps).toBe(false);
    expect(report.lines).toEqual([]);
    expect(report.summary).toBe('Book Α complete');
  });
});

describe('compileWorkMarkdown — manifest-order concatenation with gaps', () => {
  it('concatenates chapters given in scrambled order into manifest order', () => {
    const chapters = [metaChapter(7, 2), metaChapter(1, 1), metaChapter(7, 1)];
    const result = compileWorkMarkdown(chapters, META);
    expect(result.included).toEqual([
      { book: 1, chapter: 1 },
      { book: 7, chapter: 1 },
      { book: 7, chapter: 2 },
    ]);
    // Headings appear in that same order. "## Chapter 1" occurs twice (book
    // Α's chapter 1 and book Ζ's chapter 1) — search for book Ζ's chapter 1
    // starting after the book Ζ heading, so this only checks ordering WITHIN
    // book Ζ (book-level ordering is already asserted via bookAIdx/bookZIdx).
    const bookAIdx = result.markdown.indexOf('# Α');
    const bookZIdx = result.markdown.indexOf('# Ζ');
    const ch1UnderZIdx = result.markdown.indexOf('## Chapter 1', bookZIdx);
    const ch2Idx = result.markdown.indexOf('## Chapter 2', bookZIdx);
    expect(bookAIdx).toBeGreaterThanOrEqual(0);
    expect(bookZIdx).toBeGreaterThan(bookAIdx);
    expect(ch1UnderZIdx).toBeGreaterThan(bookZIdx);
    expect(ch2Idx).toBeGreaterThan(ch1UnderZIdx);
  });

  it('does not repeat a book heading for consecutive chapters of the same book', () => {
    const chapters = [metaChapter(7, 1), metaChapter(7, 2), metaChapter(7, 3)];
    const result = compileWorkMarkdown(chapters, META);
    const bookHeadingCount = (result.markdown.match(/^# Ζ$/gm) ?? []).length;
    expect(bookHeadingCount).toBe(1);
  });

  it('gaps do not block compiling what exists — result.gapReport reflects what is missing', () => {
    const chapters = [metaChapter(7, 1), metaChapter(7, 3)]; // chapter 2 missing
    const result = compileWorkMarkdown(chapters, META);
    expect(result.included).toHaveLength(2);
    expect(result.gapReport.lines).toContain('Ζ missing chapter 2');
  });
});

describe('compileWorkMarkdown — headings via the citation contract', () => {
  it('book heading uses scheme.bookLabel (Greek labels for bekker-metaphysics)', () => {
    const result = compileWorkMarkdown([metaChapter(7, 17, { meta: { ...metaChapter(7, 17).meta, spanStart: '1041a6', spanEnd: '1041b3' } })], META);
    expect(result.markdown).toContain('# Ζ');
  });

  it('leaves a corpus export book-first — the byline belongs to imported documents', () => {
    // Aristotle's manifest names an author, but a corpus export has always
    // opened on its book heading; a byline here would be a title page nobody
    // asked for.
    const result = compileWorkMarkdown([metaChapter(7, 17)], META);
    expect(result.markdown.startsWith('# Ζ\n\n## Chapter 17')).toBe(true);
    expect(result.markdown).not.toContain('*Aristotle*');
  });

  it('book heading uses Roman-numeral labels for bekker-standard (posterior-analytics)', () => {
    const chapter: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'posterior-analytics',
        book: 2,
        chapter: 19,
        citationScheme: 'bekker-standard',
        spanStart: '99b15',
        spanEnd: '99b19',
      },
      greekLines: ['g1', 'g2', 'g3', 'g4', 'g5'],
      englishLines: ['a', 'b', 'c', 'd', 'e'],
      footnotes: [],
    };
    const result = compileWorkMarkdown([chapter], POST_AN);
    expect(result.markdown).toContain('# II');
  });

  it('chapter heading includes the number and the formatted Bekker range', () => {
    const result = compileWorkMarkdown([metaChapter(7, 17)], META);
    expect(result.markdown).toContain('## Chapter 17 (1041a6–10)');
  });
});

describe('compileWorkMarkdown — continuous footnote numbering across chapters', () => {
  function chapterWithFootnote(book: number, chapter: number, noteBody: string): ChapterFile {
    return metaChapter(book, chapter, {
      englishLines: ['a note here {^1:phrase}', 'two', 'three', 'four', 'five'],
      footnotes: [{ id: 1, body: noteBody }],
    });
  }

  it('namespaces footnote ids per chapter so identical local ids never collide', () => {
    const chapters = [
      chapterWithFootnote(1, 1, 'first chapter note'),
      chapterWithFootnote(1, 2, 'second chapter note'),
      chapterWithFootnote(1, 3, 'third chapter note'),
    ];
    const result = compileWorkMarkdown(chapters, META);
    // Each chapter's local id "1" becomes a distinct namespaced id.
    expect(result.markdown).toContain('[^c1-1]');
    expect(result.markdown).toContain('[^c2-1]');
    expect(result.markdown).toContain('[^c3-1]');
    // And the corresponding footnote body blocks exist for each.
    expect(result.markdown).toContain('[^c1-1]: first chapter note');
    expect(result.markdown).toContain('[^c2-1]: second chapter note');
    expect(result.markdown).toContain('[^c3-1]: third chapter note');
  });

  it('reference markers and definition blocks appear in manifest reading order', () => {
    const chapters = [
      chapterWithFootnote(1, 2, 'second'),
      chapterWithFootnote(1, 1, 'first'),
    ];
    const result = compileWorkMarkdown(chapters, META);
    const idxRef1 = result.markdown.indexOf('[^c1-1]');
    const idxRef2 = result.markdown.indexOf('[^c2-1]');
    expect(idxRef1).toBeGreaterThanOrEqual(0);
    expect(idxRef2).toBeGreaterThan(idxRef1);
  });

  it('stored chapter files are never mutated — footnote ids on the input objects stay chapter-local', () => {
    const chapters = [chapterWithFootnote(1, 1, 'note'), chapterWithFootnote(1, 2, 'note two')];
    const before = JSON.parse(JSON.stringify(chapters));
    compileWorkMarkdown(chapters, META);
    expect(chapters).toEqual(before);
  });

  it('an unanchored footnote body (id not referenced in the namespaced text) is omitted, per chapter', () => {
    const chapter = metaChapter(1, 1, {
      englishLines: ['no marker here', 'two', 'three', 'four', 'five'],
      footnotes: [{ id: 1, body: 'orphan body' }],
    });
    const result = compileWorkMarkdown([chapter], META);
    expect(result.markdown).not.toContain('orphan body');
  });
});

describe('compileWorkMarkdown — Bekker stamp continuity across a chapter boundary', () => {
  it('each chapter stamps independently from its own span_start (no bleed from the previous chapter)', () => {
    // Chapter 1: 1041a6..1041a10 (5 rows, stamp at a10). Chapter 2: 1041a30..1041a34
    // (5 rows, stamp at... a30 not a multiple of 5, none expected) but has its
    // own column-transition case to prove chapter 2 starts fresh.
    const ch1 = metaChapter(7, 17, {
      meta: { ...metaChapter(7, 17).meta, spanStart: '1041a6', spanEnd: '1041a10' },
    });
    const ch2 = metaChapter(7, 18, {
      meta: { ...metaChapter(7, 18).meta, spanStart: '1041a30', spanEnd: '1041b3' },
      greekLines: Array.from({ length: 7 }, (_, i) => `g${i}`),
      englishLines: Array.from({ length: 7 }, (_, i) => `w${i}`),
    });
    const result = compileWorkMarkdown([ch1, ch2], META);
    expect(result.markdown).toContain('[1041a10]'); // chapter 1's every-5 stamp
    expect(result.markdown).toContain('[1041b]'); // chapter 2's own column-transition stamp
  });

  it('default stampMode is every-5 with column transitions taking priority', () => {
    const chapters = [metaChapter(7, 17)];
    const result = compileWorkMarkdown(chapters, META);
    expect(result.markdown).toContain('[1041a10]');
  });

  it('stampMode option threads through to the compiled body', () => {
    const chapters = [metaChapter(7, 17)];
    const everyLine = compileWorkMarkdown(chapters, META, { stampMode: 'every-line' });
    expect(everyLine.markdown).toContain('[1041a7]');
    expect(everyLine.markdown).toContain('[1041a8]');
  });
});

describe('compileWorkMarkdown — modes', () => {
  it('english mode (default) omits Greek text entirely', () => {
    const result = compileWorkMarkdown([metaChapter(1, 1)], META);
    expect(result.markdown).not.toMatch(/g1|g2|g3|g4|g5/);
    expect(result.markdown).toContain('one two three four');
  });

  it('bilingual mode stacks the Greek block before the English block, per chapter (not interleaved)', () => {
    const result = compileWorkMarkdown([metaChapter(1, 1)], META, { mode: 'bilingual' });
    const greekIdx = result.markdown.indexOf('g1');
    const englishIdx = result.markdown.indexOf('one two three four');
    expect(greekIdx).toBeGreaterThanOrEqual(0);
    expect(englishIdx).toBeGreaterThan(greekIdx);
  });

  it('bilingual mode Bekker-stamps the Greek block using the same stamping rule as English', () => {
    const result = compileWorkMarkdown([metaChapter(7, 17)], META, { mode: 'bilingual' });
    // Greek block appears before English block; the every-5 stamp [1041a10]
    // should appear twice (once in each block).
    const occurrences = result.markdown.split('[1041a10]').length - 1;
    expect(occurrences).toBe(2);
  });

  it('bilingual mode with multiple chapters keeps each chapter\'s Greek+English pair stacked together, not grouped by language', () => {
    const chapters = [metaChapter(1, 1), metaChapter(1, 2)];
    const result = compileWorkMarkdown(chapters, META, { mode: 'bilingual' });
    const ch1Heading = result.markdown.indexOf('## Chapter 1');
    const ch1Greek = result.markdown.indexOf('g1', ch1Heading);
    const ch1English = result.markdown.indexOf('one two three four', ch1Heading);
    const ch2Heading = result.markdown.indexOf('## Chapter 2');
    expect(ch1Greek).toBeGreaterThan(ch1Heading);
    expect(ch1English).toBeGreaterThan(ch1Greek);
    expect(ch1English).toBeLessThan(ch2Heading);
  });
});

describe('compileWorkMarkdown — line splits (design doc D6, export)', () => {
  // Row index 2 (address 1041a8) carries a real Greek word boundary at
  // offset 6 and a matching `¶` in its English markup.
  function splitChapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
    return metaChapter(1, 1, {
      greekLines: ['g1', 'g2', 'gamma gamma-second', 'g4', 'g5'],
      englishLines: ['one', 'two', 'three¶four', 'five', 'six'],
      meta: {
        ...metaChapter(1, 1).meta,
        lineSplits: [{ ref: '1041a8', offset: 6 }],
      },
      ...overrides,
    });
  }

  it('an unsplit chapter compiles byte-identically to before the feature (regression)', () => {
    const result = compileWorkMarkdown([metaChapter(1, 1)], META);
    expect(result.markdown).toContain('one two three four [1041a10] five');
  });

  it('english mode: the paragraph break lands exactly at the split', () => {
    const result = compileWorkMarkdown([splitChapter()], META);
    const bodyStart = result.markdown.indexOf('## Chapter 1');
    const body = result.markdown.slice(bodyStart);
    const parts = body.split('\n\n');
    // "## Chapter 1 (...)", paragraph 1, paragraph 2
    expect(parts[1].trimEnd()).toBe('one two three');
    expect(parts[2].trimEnd()).toBe('four five [1041a10] six');
  });

  it('bilingual mode: BOTH the Greek block and the English block paragraph-break at the same split (John\'s confirmed parity)', () => {
    const result = compileWorkMarkdown([splitChapter()], META, { mode: 'bilingual' });
    const bodyStart = result.markdown.indexOf('## Chapter 1');
    const body = result.markdown.slice(bodyStart);
    const parts = body.split('\n\n');
    // heading, greek-para-1, greek-para-2, english-para-1, english-para-2
    expect(parts).toHaveLength(5);
    expect(parts[1].trimEnd()).toBe('g1 g2 gamma');
    // The Greek block stamps too (bilingual parity for the SAME rows means
    // the SAME segment carries isStampSegment on both sides).
    expect(parts[2].trimEnd()).toBe('gamma-second g4 [1041a10] g5');
    expect(parts[3].trimEnd()).toBe('one two three');
    expect(parts[4].trimEnd()).toBe('four five [1041a10] six');
  });

  it('bilingual mode: the every-5 stamp appears once in the Greek block and once in the English block (twice total), never duplicated by the split', () => {
    const result = compileWorkMarkdown([splitChapter()], META, { mode: 'bilingual' });
    const occurrences = result.markdown.split('[1041a10]').length - 1;
    expect(occurrences).toBe(2);
  });

  it('a two-split line yields three paragraphs in whole-work compile too', () => {
    const c = splitChapter({
      greekLines: ['g1', 'g2', 'gamma gamma-second gamma-third', 'g4', 'g5'],
      englishLines: ['one', 'two', 'alpha¶beta¶gamma', 'five', 'six'],
      meta: {
        ...splitChapter().meta,
        lineSplits: [
          { ref: '1041a8', offset: 6 },
          { ref: '1041a8', offset: 19 },
        ],
      },
    });
    const result = compileWorkMarkdown([c], META);
    const bodyStart = result.markdown.indexOf('## Chapter 1');
    const parts = result.markdown.slice(bodyStart).split('\n\n');
    expect(parts[1].trimEnd()).toBe('one two alpha');
    expect(parts[2].trimEnd()).toBe('beta');
    expect(parts[3].trimEnd()).toBe('gamma five [1041a10] six');
  });

  it('stamp fires once on the first non-empty segment, even across a chapter compiled with other chapters', () => {
    const c = metaChapter(1, 2, {
      greekLines: ['g1', 'g2', 'g3', 'g4', 'penta penta-second'],
      englishLines: ['one', 'two', 'three', 'four', '¶the fifth word'],
      meta: {
        ...metaChapter(1, 2).meta,
        lineSplits: [{ ref: '1041a10', offset: 6 }],
      },
    });
    const result = compileWorkMarkdown([metaChapter(1, 1), c], META);
    const stampCount = (result.markdown.match(/\[1041a10\]/g) ?? []).length;
    // One from chapter 1 (unsplit, "five") + one from chapter 2's split row
    // (on its second, non-empty segment) = 2 total, never 3.
    expect(stampCount).toBe(2);
    expect(result.markdown).toContain('[1041a10] the fifth word');
  });

  it('footnotes resolve across the split when compiled with other chapters (namespacing + split coexist)', () => {
    const c1 = metaChapter(1, 1, {
      englishLines: ['a note here {^1:phrase}', 'two', 'three', 'four', 'five'],
      footnotes: [{ id: 1, body: 'first chapter note' }],
    });
    const c2 = splitChapter({
      englishLines: ['one', 'two', 'three¶four {^1:with a note}', 'five', 'six'],
      footnotes: [{ id: 1, body: 'second chapter note, anchored after the split' }],
      meta: { ...splitChapter().meta, book: 1, chapter: 2 },
    });
    const result = compileWorkMarkdown([c1, c2], META);
    expect(result.markdown).toContain('[^c1-1]: first chapter note');
    expect(result.markdown).toContain('four with a note[^c2-1]');
    expect(result.markdown).toContain('[^c2-1]: second chapter note, anchored after the split');
  });

  it('stored chapter files are never mutated by compile, even with a split-bearing fixture', () => {
    const c = splitChapter();
    const before = JSON.parse(JSON.stringify(c));
    compileWorkMarkdown([c], META, { mode: 'bilingual' });
    expect(c).toEqual(before);
  });
});

describe('compileWorkMarkdown — document-spine single-document route (D8)', () => {
  function freeChapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
    return {
      meta: {
        schemaVersion: 1,
        work: 'free-doc',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶2',
      },
      greekLines: ['Source one.', 'Source two.'],
      englishLines: ['First translated paragraph.', ''],
      englishParaLines: ['', 'Second paragraph from paragraph layer.'],
      footnotes: [],
      ...overrides,
    };
  }

  it('renders one title-only document with no book/chapter headings or Bekker stamps', () => {
    const result = compileWorkMarkdown([freeChapter()], FREE_WORK);
    expect(result.markdown).toBe(
      '# Free Doc\n\n' +
        'First translated paragraph.\n\n' +
        'Second paragraph from paragraph layer.\n',
    );
    expect(result.markdown).not.toContain('## Chapter');
    expect(result.markdown).not.toContain('[');
    expect(result.gapReport).toEqual({ hasGaps: false, lines: [], summary: 'Document present.' });
    expect(result.included).toEqual([{ book: 1, chapter: 1 }]);
  });

  it('puts a non-empty author in an italic paragraph under the title', () => {
    const result = compileWorkMarkdown(
      [freeChapter()],
      { ...FREE_WORK, author: 'Jane Austen' },
    );
    expect(result.markdown).toBe(
      '# Free Doc\n\n' +
        '*Jane Austen*\n\n' +
        'First translated paragraph.\n\n' +
        'Second paragraph from paragraph layer.\n',
    );
  });

  // Bilingual mode previously IGNORED the mode for document-spine works and
  // silently produced English-only output under the bilingual filename. Now
  // it interleaves per unit: source block, then English block (untranslated
  // units keep their source and mark the missing English with one `…`).
  it('bilingual mode interleaves source and English per paragraph', () => {
    const result = compileWorkMarkdown([freeChapter()], FREE_WORK, { mode: 'bilingual' });
    expect(result.markdown).toBe(
      '# Free Doc\n\n' +
        'Source one.\n\n' +
        'First translated paragraph.\n\n' +
        'Source two.\n\n' +
        'Second paragraph from paragraph layer.\n',
    );
  });

  it('bilingual mode marks an untranslated paragraph with an ellipsis after its source', () => {
    const c = freeChapter({ englishParaLines: undefined }); // row 2 now untranslated
    const result = compileWorkMarkdown([c], FREE_WORK, { mode: 'bilingual' });
    expect(result.markdown).toBe(
      '# Free Doc\n\n' +
        'Source one.\n\n' +
        'First translated paragraph.\n\n' +
        'Source two.\n\n' +
        '…\n',
    );
  });

  it('bilingual mode on a plain-line doc interleaves per paragraph group, keeping hard line breaks on both sides', () => {
    const FREE_LINES: WorkMeta = {
      id: 'free-lines',
      title: 'Free Lines',
      author: '',
      scheme: 'plain-line',
      books: [{ n: 1, label: '' }],
    };
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-lines',
        book: 1,
        chapter: 1,
        citationScheme: 'plain-line',
        spanStart: '1',
        spanEnd: '4',
        paragraphStarts: [1, 3],
      },
      greekLines: ['L1', 'L2', 'L3', 'L4'],
      englishLines: ['Line one', 'Line two', 'Line three', ''],
      footnotes: [],
    };
    const result = compileWorkMarkdown([c], FREE_LINES, { mode: 'bilingual' });
    expect(result.markdown).toBe(
      '# Free Lines\n\n' +
        'L1\\\nL2\n\n' +
        'Line one\\\nLine two\n\n' +
        'L3\\\nL4\n\n' +
        'Line three\n\n' +
        '…\n', // L4 untranslated → the group's trailing gap is marked
    );
  });

  it('bilingual document-spine export keeps sentence-layer footnotes on the English side', () => {
    const c = freeChapter({
      englishLines: ['A translated {^1:phrase}.', ''],
      footnotes: [{ id: 1, body: 'the note' }],
    });
    const result = compileWorkMarkdown([c], FREE_WORK, { mode: 'bilingual' });
    expect(result.markdown).toContain('phrase[^1]');
    expect(result.markdown).toContain('[^1]: the note');
    // The source blocks never carry the reference.
    expect(result.markdown).toContain('Source one.\n\n');
  });
});

describe('compileWorkMarkdown — document-spine multi-chapter container (D8 structure)', () => {
  // A container work: one Book "Prima Pars" with two named chapter slots.
  const CONTAINER: WorkMeta = {
    id: 'summa',
    title: 'Summa Theologiae',
    author: '',
    scheme: 'paragraph',
    books: [{ n: 1, label: 'Prima Pars' }],
    // documentBooks rides along at runtime (WorkManifest); compile reads it
    // defensively for the chapter labels.
    documentBooks: [
      { n: 1, label: 'Prima Pars', chapters: [{ n: 1, label: 'Question 2' }, { n: 2, label: 'Question 3' }] },
    ],
  } as WorkMeta;

  function q(chapter: number, english: string, footnotes: ChapterFile['footnotes'] = []): ChapterFile {
    return {
      meta: {
        schemaVersion: 1,
        work: 'summa',
        book: 1,
        chapter,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶1',
      },
      greekLines: [`Source Q${chapter}.`],
      englishLines: [english],
      footnotes,
    };
  }

  it('renders the title once, then Book + named-Chapter headings and each body', () => {
    const result = compileWorkMarkdown([q(1, 'Article one.'), q(2, 'Article two.')], CONTAINER);
    expect(result.markdown).toBe(
      '# Summa Theologiae\n\n' +
        '## Prima Pars\n\n' +
        '### Question 2\n\n' +
        'Article one.\n\n' +
        '### Question 3\n\n' +
        'Article two.\n',
    );
    expect(result.included).toEqual([{ book: 1, chapter: 1 }, { book: 1, chapter: 2 }]);
  });

  it('a container work with only ONE saved chapter still emits its Book/Chapter headings', () => {
    // Regression: gate the byte-identical single-doc shortcut on the absence of
    // documentBooks, not on chapter count — otherwise a work just after "+ Book"
    // (one saved chapter) would export without the headings the user just typed.
    const result = compileWorkMarkdown([q(1, 'Article one.')], CONTAINER);
    expect(result.markdown).toBe(
      '# Summa Theologiae\n\n' +
        '## Prima Pars\n\n' +
        '### Question 2\n\n' +
        'Article one.\n',
    );
  });

  it('does not print the marked line twice — as its heading and again as body', () => {
    // The row the chapter heading came from carries a `headers` mark after
    // splitDocument re-bases it. Exporting it again as the body's first
    // paragraph printed "Question 2" as a heading and then "Question 2" as a
    // paragraph directly under it.
    const marked: ChapterFile = {
      ...q(1, 'Question 2'),
      meta: { ...q(1, 'Question 2').meta, headers: [{ row: 1, level: 2 }] },
      greekLines: ['Quaestio 2', 'Corpus of the article.'],
      englishLines: ['Question 2', 'Body of the article.'],
    };
    const result = compileWorkMarkdown([marked], CONTAINER);
    expect(result.markdown).toBe(
      '# Summa Theologiae\n\n' +
        '## Prima Pars\n\n' +
        '### Question 2\n\n' +
        'Body of the article.\n',
    );
  });

  it('bilingual keeps the marked line\'s SOURCE under the heading, once', () => {
    // English heading, source italic beneath (John's choice). Dropping the row
    // outright would lose "Quaestio 2" from a bilingual export entirely.
    const marked: ChapterFile = {
      ...q(1, 'Question 2'),
      meta: { ...q(1, 'Question 2').meta, headers: [{ row: 1, level: 2 }] },
      greekLines: ['Quaestio 2', 'Corpus articuli.'],
      englishLines: ['Question 2', 'Body of the article.'],
    };
    const result = compileWorkMarkdown([marked], CONTAINER, { mode: 'bilingual' });
    expect(result.markdown).toBe(
      '# Summa Theologiae\n\n' +
        '## Prima Pars\n\n' +
        '### Question 2\n\n' +
        '*Quaestio 2*\n\n' +
        'Corpus articuli.\n\n' +
        'Body of the article.\n',
    );
    // The heading text appears exactly once as a heading and never as a body line.
    expect(result.markdown.match(/Question 2/g)).toHaveLength(1);
  });

  it('an unmarked opening part (a preface) keeps its first line', () => {
    // Only a part whose first row carries a mark supplied a heading; a preface
    // that opens on plain text must still export that text.
    const preface = q(1, 'Opening words.');
    const result = compileWorkMarkdown([preface], CONTAINER);
    expect(result.markdown).toContain('### Question 2\n\nOpening words.\n');
  });

  it('puts the author under the title before the container headings', () => {
    const result = compileWorkMarkdown(
      [q(1, 'Article one.')],
      { ...CONTAINER, author: 'Thomas Aquinas' },
    );
    expect(result.markdown).toBe(
      '# Summa Theologiae\n\n' +
        '*Thomas Aquinas*\n\n' +
        '## Prima Pars\n\n' +
        '### Question 2\n\n' +
        'Article one.\n',
    );
  });

  it('namespaces footnote ids so two chapters’ local id 1 don’t collide', () => {
    const result = compileWorkMarkdown(
      [
        q(1, 'A {^1:first note}.', [{ id: 1, body: 'first' }]),
        q(2, 'B {^1:second note}.', [{ id: 1, body: 'second' }]),
      ],
      CONTAINER,
    );
    // Distinct namespaced refs + definitions, no collision.
    expect(result.markdown).toContain('[^c1-1]: first');
    expect(result.markdown).toContain('[^c2-1]: second');
  });

  it('falls back to "Book N" / "Chapter N" when a container has empty labels', () => {
    // A container (documentBooks present) whose labels are empty still exports
    // as a structured work — with numeric fallbacks, not the single-doc path.
    const emptyLabels: WorkMeta = {
      id: 'summa',
      title: 'Summa Theologiae',
      author: '',
      scheme: 'paragraph',
      books: [{ n: 1, label: '' }],
      documentBooks: [{ n: 1, label: '', chapters: [{ n: 1, label: '' }, { n: 2, label: '' }] }],
    } as WorkMeta;
    const result = compileWorkMarkdown([q(1, 'One.'), q(2, 'Two.')], emptyLabels);
    expect(result.markdown).toContain('## Book 1');
    expect(result.markdown).toContain('### Chapter 1');
    expect(result.markdown).toContain('### Chapter 2');
  });
});

describe('filename helpers', () => {
  it('sanitizes illegal filename characters and collapses whitespace', () => {
    expect(sanitizeFilenameComponent('A: B / C * D?')).toBe('A B C D');
    expect(sanitizeFilenameComponent('  spaced   out  ')).toBe('spaced out');
  });

  it('default filename for english mode', () => {
    expect(compileDefaultFilename(META, 'english')).toBe('Metaphysics — Aristotle (translation).docx');
  });

  it('default filename for bilingual mode', () => {
    expect(compileDefaultFilename(META, 'bilingual')).toBe('Metaphysics — Aristotle (Greek and translation).docx');
  });

  it('bilingual filename names the work OWN source language, not Greek', () => {
    // An imported document can be Latin, German, anything — "Greek and
    // translation" was wrong for every work that is not Aristotle's.
    expect(compileDefaultFilename({ ...META, title: 'Summa Theologiae', author: '', language: 'Latin' } as never, 'bilingual')).toBe(
      'Summa Theologiae (Latin and translation).docx',
    );
    // No declared language at all: a neutral word, never a wrong one.
    const { originalLanguage: _drop, ...noLanguage } = META as { originalLanguage?: string };
    expect(compileDefaultFilename({ ...noLanguage, author: '' } as never, 'bilingual')).toBe(
      'Metaphysics (source and translation).docx',
    );
  });

  it('default filename with no mode specified falls back to english wording', () => {
    expect(compileDefaultFilename(META, undefined)).toBe('Metaphysics — Aristotle (translation).docx');
  });

  it('default filename omits the byline separator for anonymous free works', () => {
    expect(compileDefaultFilename(FREE_WORK, 'english')).toBe('Free Doc (translation).docx');
  });
});

describe('compileWorkMarkdown — bilingual layout and order', () => {
  // Row index 2 splits (see splitChapter above), so every chapter here has
  // exactly two paragraph groups per side — enough to tell "stacked blocks"
  // apart from "alternating pairs".
  function twoGroupChapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
    return metaChapter(1, 1, {
      greekLines: ['g1', 'g2', 'gamma gamma-second', 'g4', 'g5'],
      englishLines: ['one', 'two', 'three¶four', 'five', 'six'],
      meta: { ...metaChapter(1, 1).meta, lineSplits: [{ ref: '1041a8', offset: 6 }] },
      ...overrides,
    });
  }

  function docChapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
    return {
      meta: {
        schemaVersion: 1,
        work: 'free-doc',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶2',
      },
      greekLines: ['Source one.', 'Source two.'],
      englishLines: ['First translated paragraph.', ''],
      englishParaLines: ['', 'Second paragraph from paragraph layer.'],
      footnotes: [],
      ...overrides,
    };
  }

  function bodyParts(markdown: string): string[] {
    const bodyStart = markdown.indexOf('## Chapter 1');
    return markdown.slice(bodyStart).split('\n\n').map((p) => p.trimEnd());
  }

  it('an unset layout is the historical block layout, byte for byte', () => {
    const explicit = compileWorkMarkdown([twoGroupChapter()], META, { mode: 'bilingual', bilingualLayout: 'block' });
    const unset = compileWorkMarkdown([twoGroupChapter()], META, { mode: 'bilingual' });
    expect(unset.markdown).toBe(explicit.markdown);
  });

  it('alternating pairs each source group with its own translation group', () => {
    const result = compileWorkMarkdown([twoGroupChapter()], META, {
      mode: 'bilingual',
      bilingualLayout: 'alternating',
    });
    const parts = bodyParts(result.markdown);
    // heading, g-1, en-1, g-2, en-2 — interleaved, not stacked
    expect(parts).toHaveLength(5);
    expect(parts[1]).toBe('g1 g2 gamma');
    expect(parts[2]).toBe('one two three');
    expect(parts[3]).toBe('gamma-second g4 [1041a10] g5');
    expect(parts[4]).toBe('four five [1041a10] six');
  });

  it('translation-first flips the lead side in both block and alternating', () => {
    const block = bodyParts(
      compileWorkMarkdown([twoGroupChapter()], META, {
        mode: 'bilingual',
        bilingualLayout: 'block',
        bilingualOrder: 'translation-first',
      }).markdown,
    );
    expect(block[1]).toBe('one two three');
    expect(block[3]).toBe('g1 g2 gamma');

    const alternating = bodyParts(
      compileWorkMarkdown([twoGroupChapter()], META, {
        mode: 'bilingual',
        bilingualLayout: 'alternating',
        bilingualOrder: 'translation-first',
      }).markdown,
    );
    expect(alternating[1]).toBe('one two three');
    expect(alternating[2]).toBe('g1 g2 gamma');
  });

  it('table emits one headerless two-column pipe table, one row per pair', () => {
    const result = compileWorkMarkdown([twoGroupChapter()], META, {
      mode: 'bilingual',
      bilingualLayout: 'table',
    });
    const parts = bodyParts(result.markdown);
    expect(parts).toHaveLength(2); // heading + the table, one section
    expect(parts[1]).toBe(
      '|  |  |\n' +
        '|:---|:---|\n' +
        '| g1 g2 gamma | one two three |\n' +
        '| gamma-second g4 [1041a10] g5 | four five [1041a10] six |',
    );
  });

  it('table respects translation-first by swapping the columns', () => {
    const result = compileWorkMarkdown([twoGroupChapter()], META, {
      mode: 'bilingual',
      bilingualLayout: 'table',
      bilingualOrder: 'translation-first',
    });
    expect(result.markdown).toContain('| one two three | g1 g2 gamma |');
  });

  it('table escapes a literal pipe in the text so it cannot split a cell', () => {
    const result = compileWorkMarkdown(
      [twoGroupChapter({ englishLines: ['a | b', 'two', 'three¶four', 'five', 'six'] })],
      META,
      { mode: 'bilingual', bilingualLayout: 'table' },
    );
    expect(result.markdown).toContain('| a \\| b two three |');
  });

  it('an untranslated group is a blank cell in a table and an ellipsis when alternating', () => {
    const untranslated = twoGroupChapter({ englishLines: ['one', 'two', 'three¶', '', ''] });

    const table = compileWorkMarkdown([untranslated], META, {
      mode: 'bilingual',
      bilingualLayout: 'table',
    });
    // No [1041a10] on either side: isStampSegment is derived from the English
    // markup, so an untranslated row carries no stamp at all — the same rule
    // the block layout has always followed.
    expect(table.markdown).toContain('| gamma-second g4 g5 |  |');

    const alternating = compileWorkMarkdown([untranslated], META, {
      mode: 'bilingual',
      bilingualLayout: 'alternating',
    });
    const parts = bodyParts(alternating.markdown);
    expect(parts[3]).toBe('gamma-second g4 g5');
    expect(parts[4]).toBe('…');
  });

  it('footnotes still resolve under the table layout', () => {
    const c = twoGroupChapter({
      englishLines: ['one {^1:noted}', 'two', 'three¶four', 'five', 'six'],
      footnotes: [{ id: 1, body: 'the note' }],
    });
    const result = compileWorkMarkdown([c], META, { mode: 'bilingual', bilingualLayout: 'table' });
    expect(result.markdown).toContain('noted[^c1-1]');
    expect(result.markdown).toContain('[^c1-1]: the note');
  });

  it('document-spine works keep alternating as their unset default, and honour an explicit layout', () => {
    const unset = compileWorkMarkdown([docChapter()], FREE_WORK, { mode: 'bilingual' });
    const alternating = compileWorkMarkdown([docChapter()], FREE_WORK, {
      mode: 'bilingual',
      bilingualLayout: 'alternating',
    });
    expect(unset.markdown).toBe(alternating.markdown);

    const block = compileWorkMarkdown([docChapter()], FREE_WORK, {
      mode: 'bilingual',
      bilingualLayout: 'block',
    });
    expect(block.markdown).toBe(
      '# Free Doc\n\n' +
        'Source one.\n\n' +
        'Source two.\n\n' +
        'First translated paragraph.\n\n' +
        'Second paragraph from paragraph layer.\n',
    );

    const table = compileWorkMarkdown([docChapter()], FREE_WORK, {
      mode: 'bilingual',
      bilingualLayout: 'table',
    });
    expect(table.markdown).toBe(
      '# Free Doc\n\n' +
        '|  |  |\n' +
        '|:---|:---|\n' +
        '| Source one. | First translated paragraph. |\n' +
        '| Source two. | Second paragraph from paragraph layer. |\n',
    );
  });

  it('table layout puts each hard-broken line of a plain-line doc in its own row', () => {
    const FREE_LINES: WorkMeta = {
      id: 'free-lines',
      title: 'Free Lines',
      author: '',
      scheme: 'plain-line',
      books: [{ n: 1, label: '' }],
    };
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-lines',
        book: 1,
        chapter: 1,
        citationScheme: 'plain-line',
        spanStart: '1',
        spanEnd: '2',
        paragraphStarts: [1],
      },
      greekLines: ['L1', 'L2'],
      englishLines: ['Line one', 'Line two'],
      footnotes: [],
    };
    const result = compileWorkMarkdown([c], FREE_LINES, {
      mode: 'bilingual',
      bilingualLayout: 'table',
    });
    // A pipe-table cell is one physical line, so the hard break becomes a row
    // break — which is what side-by-side verse wants anyway.
    expect(result.markdown).toBe(
      '# Free Lines\n\n' +
        '|  |  |\n' +
        '|:---|:---|\n' +
        '| L1 | Line one |\n' +
        '| L2 | Line two |\n',
    );
  });
});
