import { describe, expect, it } from 'vitest';
import {
  chapterToPandocMarkdown,
  deriveRowAddresses,
  documentToPandocMarkdown,
  markupToPandoc,
  stripLanguageSpans,
} from '../pandocMarkdown';
import { compileWorkMarkdown } from '../compile';
import { parseManifest } from '../../works/manifest';
import type { ChapterFile } from '../../chapterfile/types';
import type { WorkMeta } from '../../citation/types';
import metaphysicsYaml from '../../works/manifests/metaphysics.yaml?raw';
import posteriorAnalyticsYaml from '../../works/manifests/posterior-analytics.yaml?raw';

const META = parseManifest(metaphysicsYaml, 'metaphysics.yaml'); // book 7 label Ζ
const POST_AN = parseManifest(posteriorAnalyticsYaml, 'posterior-analytics.yaml'); // book 2 label II
const FREE_PARAGRAPH_META: WorkMeta = {
  id: 'free-paragraph',
  title: 'Free Paragraph',
  author: '',
  scheme: 'paragraph',
  books: [{ n: 1, label: '' }],
};
const FREE_LINE_META: WorkMeta = {
  id: 'free-lines',
  title: 'Free Lines',
  author: '',
  scheme: 'plain-line',
  books: [{ n: 1, label: '' }],
};
const CORPUS_PARAGRAPH_META: WorkMeta = {
  id: 'isagoge',
  title: 'Isagoge',
  author: 'Porphyry',
  scheme: 'busse-paragraph',
  books: [{ n: 1, label: 'Book' }],
};

function chapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
  return {
    meta: {
      schemaVersion: 1,
      work: 'metaphysics',
      book: 7,
      chapter: 17,
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

describe('deriveRowAddresses', () => {
  it('single column: consecutive line numbers', () => {
    expect(deriveRowAddresses('1041a6', '1041a10', 5)).toEqual([
      '1041a6',
      '1041a7',
      '1041a8',
      '1041a9',
      '1041a10',
    ]);
  });

  it('point reference: one row', () => {
    expect(deriveRowAddresses('1041a6', '1041a6', 1)).toEqual(['1041a6']);
  });

  it('throws if single-column span implies a different row count', () => {
    expect(() => deriveRowAddresses('1041a6', '1041a10', 4)).toThrow(/implies 5 row/);
  });

  it('single a->b column transition, matching the Meta Z17 fixture shape', () => {
    // 1041a6..1041a33 (28 rows) + 1041b1..1041b3 (3 rows) = 31 rows.
    const out = deriveRowAddresses('1041a6', '1041b3', 31);
    expect(out[0]).toBe('1041a6');
    expect(out[27]).toBe('1041a33');
    expect(out[28]).toBe('1041b1');
    expect(out[30]).toBe('1041b3');
    expect(out).toHaveLength(31);
  });

  it('single page-rollover transition (b -> next page a)', () => {
    // 999b28..999b30 (3 rows) + 1000a1..1000a2 (2 rows) = 5 rows.
    const out = deriveRowAddresses('999b28', '1000a2', 5);
    expect(out).toEqual(['999b28', '999b29', '999b30', '1000a1', '1000a2']);
  });

  it('throws a clear diagnosable error for a span crossing more than one transition', () => {
    expect(() => deriveRowAddresses('1041a30', '1042a2', 10)).toThrow(/more than one Bekker column transition/);
  });

  it('empty chapter (0 rows) yields no addresses', () => {
    expect(deriveRowAddresses('1041a6', '1041a6', 0)).toEqual([]);
  });
});

describe('chapterToPandocMarkdown — heading', () => {
  it('formats the heading with Greek book label, title not italicized, range via scheme.formatRange', () => {
    const md = chapterToPandocMarkdown(chapter(), META);
    expect(md.startsWith('## Metaphysics Ζ.17 (1041a6–10)')).toBe(true);
    // Not italicized: no literal "*Metaphysics*" anywhere near the heading.
    expect(md.split('\n')[0]).not.toContain('*Metaphysics*');
  });

  it('formats the heading with a Roman-numeral book label for posterior-analytics', () => {
    const c = chapter({
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
    });
    const md = chapterToPandocMarkdown(c, POST_AN);
    expect(md.split('\n')[0]).toBe('## Posterior Analytics II.19 (99b15–19)');
  });

  it('a point reference (span_start === span_end) collapses to a single ref', () => {
    const c = chapter({
      meta: { ...chapter().meta, spanStart: '1041a6', spanEnd: '1041a6' },
      greekLines: ['g1'],
      englishLines: ['solo'],
    });
    const md = chapterToPandocMarkdown(c, META);
    expect(md.split('\n')[0]).toBe('## Metaphysics Ζ.17 (1041a6)');
  });
});

describe('chapterToPandocMarkdown — body assembly', () => {
  it('joins non-empty English rows with single spaces into one flowing paragraph', () => {
    const md = chapterToPandocMarkdown(chapter(), META);
    const body = md.split('\n\n')[1].trimEnd();
    // default stampMode 'every-5': row index 4 (1-based row5, line 10, multiple of 5) gets a stamp.
    expect(body).toBe('one two three four [1041a10] five');
  });

  it('marks untranslated gaps BETWEEN content with an ellipsis paragraph', () => {
    const c = chapter({ englishLines: ['one', '', 'three', '   ', 'five'] });
    const md = chapterToPandocMarkdown(c, META);
    const paras = md.split('\n\n').map((p) => p.trimEnd());
    // paras[0] is the heading; the body follows — each blank span → one '…'.
    expect(paras.slice(1)).toEqual(['one', '…', 'three', '…', '[1041a10] five']);
  });

  it('does NOT emit a leading or trailing ellipsis for edge untranslated stretches', () => {
    const c = chapter({ englishLines: ['', '', 'three', '', ''] });
    const md = chapterToPandocMarkdown(c, META);
    const paras = md.split('\n\n').map((p) => p.trimEnd());
    expect(paras.slice(1)).toEqual(['three']); // no '…' before or after
  });

  it('an all-empty chapter produces an empty body (no stray ellipsis)', () => {
    const c = chapter({ englishLines: ['', '', '', '', ''] });
    const md = chapterToPandocMarkdown(c, META);
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('');
  });
});

describe('chapterToPandocMarkdown — Bekker stamping modes', () => {
  // 10-row chapter: 1041a6..1041a15. Multiples of 5 within: a10, a15.
  function tenRowChapter(): ChapterFile {
    return chapter({
      meta: { ...chapter().meta, spanStart: '1041a6', spanEnd: '1041a15' },
      greekLines: Array.from({ length: 10 }, (_, i) => `g${i}`),
      englishLines: Array.from({ length: 10 }, (_, i) => `w${i}`),
    });
  }

  it('every-5 (default): stamps at multiples of 5 only, none here is a column start', () => {
    const md = chapterToPandocMarkdown(tenRowChapter(), META);
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('w0 w1 w2 w3 [1041a10] w4 w5 w6 w7 w8 [1041a15] w9');
  });

  it('every-line: stamps every row (row 0 excluded — carried by the heading)', () => {
    const md = chapterToPandocMarkdown(tenRowChapter(), META, { stampMode: 'every-line' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe(
      'w0 [1041a7] w1 [1041a8] w2 [1041a9] w3 [1041a10] w4 [1041a11] w5 [1041a12] w6 [1041a13] w7 [1041a14] w8 [1041a15] w9',
    );
  });

  it('columns: no stamps at all when the span never transitions column', () => {
    const md = chapterToPandocMarkdown(tenRowChapter(), META, { stampMode: 'columns' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('w0 w1 w2 w3 w4 w5 w6 w7 w8 w9');
  });

  it('columns: stamps bare column ref only at the transition row', () => {
    // 1041a30..1041a33 (4 rows) + 1041b1..1041b3 (3 rows) = 7 rows; transition at row index 4.
    const c = chapter({
      meta: { ...chapter().meta, spanStart: '1041a30', spanEnd: '1041b3' },
      greekLines: Array.from({ length: 7 }, (_, i) => `g${i}`),
      englishLines: Array.from({ length: 7 }, (_, i) => `w${i}`),
    });
    const md = chapterToPandocMarkdown(c, META, { stampMode: 'columns' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('w0 w1 w2 w3 [1041b] w4 w5 w6');
  });

  it('every-5: column transition gets the bare-column stamp, not a full every-line-style ref', () => {
    // 1041a30..1041a33 (4 rows, none a multiple of 5) + 1041b1..1041b3 (3
    // rows). Row index 4 = 1041b1, a column start — per spec it gets the bare
    // "[1041b]" stamp even though it's also "due" by the every-5 cadence
    // count (it is not itself a multiple of 5, so this mainly proves column
    // transitions stamp independently of the multiple-of-5 test).
    const c = chapter({
      meta: { ...chapter().meta, spanStart: '1041a30', spanEnd: '1041b3' },
      greekLines: Array.from({ length: 7 }, (_, i) => `g${i}`),
      englishLines: Array.from({ length: 7 }, (_, i) => `w${i}`),
    });
    const md = chapterToPandocMarkdown(c, META, { stampMode: 'every-5' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('w0 w1 w2 w3 [1041b] w4 w5 w6');
  });

  it('every-5: a multiple-of-5 line that is ALSO a column start renders the bare column stamp', () => {
    // Construct a column whose length is exactly 5 lines longer than a
    // multiple of the far side, so the transition row's line number would
    // independently qualify under naive every-5 arithmetic based on row
    // index alone — the real rule keys off the ABSOLUTE line number peer
    // column, and a transition row is always line 1 (never a multiple of
    // 5), so this test instead pins the actual coincidence: verify the
    // stamp text is the bare column form, never "[1041b1]".
    const c = chapter({
      meta: { ...chapter().meta, spanStart: '1041a30', spanEnd: '1041b3' },
      greekLines: Array.from({ length: 7 }, (_, i) => `g${i}`),
      englishLines: Array.from({ length: 7 }, (_, i) => `w${i}`),
    });
    const md = chapterToPandocMarkdown(c, META, { stampMode: 'every-5' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).not.toContain('[1041b1]');
    expect(body).toContain('[1041b]');
  });
});

describe('chapterToPandocMarkdown — column_starts (exact multi-transition addressing)', () => {
  // 16 rows across FOUR columns: 1041a30..a33 (rows 1–4), 1041b1..b6 (rows
  // 5–10), 1042a1..a3 (rows 11–13), 1042b1..b3 (rows 14–16). Impossible for
  // the single-transition fallback — exact with column_starts.
  function multiTransitionChapter(): ChapterFile {
    return chapter({
      meta: {
        ...chapter().meta,
        spanStart: '1041a30',
        spanEnd: '1042b3',
        columnStarts: [
          { ref: '1041a30', rowIndex: 1 },
          { ref: '1041b1', rowIndex: 5 },
          { ref: '1042a1', rowIndex: 11 },
          { ref: '1042b1', rowIndex: 14 },
        ],
      },
      greekLines: Array.from({ length: 16 }, (_, i) => `g${i}`),
      englishLines: Array.from({ length: 16 }, (_, i) => `w${i}`),
    });
  }

  it('every-line: every row address derived exactly via rowAddress across all three transitions', () => {
    const md = chapterToPandocMarkdown(multiTransitionChapter(), META, { stampMode: 'every-line' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe(
      'w0 [1041a31] w1 [1041a32] w2 [1041a33] w3 [1041b1] w4 [1041b2] w5 [1041b3] w6 [1041b4] w7 ' +
        '[1041b5] w8 [1041b6] w9 [1042a1] w10 [1042a2] w11 [1042a3] w12 [1042b1] w13 [1042b2] w14 [1042b3] w15',
    );
  });

  it('every-5: bare stamps at all three transitions, full stamp at the multiple-of-5 line', () => {
    const md = chapterToPandocMarkdown(multiTransitionChapter(), META, { stampMode: 'every-5' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('w0 w1 w2 w3 [1041b] w4 w5 w6 w7 [1041b5] w8 w9 [1042a] w10 w11 w12 [1042b] w13 w14 w15');
  });

  it('columns: bare stamps at exactly the three transition rows', () => {
    const md = chapterToPandocMarkdown(multiTransitionChapter(), META, { stampMode: 'columns' });
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('w0 w1 w2 w3 [1041b] w4 w5 w6 w7 w8 w9 [1042a] w10 w11 w12 [1042b] w13 w14 w15');
  });

  it('the same span WITHOUT column_starts still throws the clear fallback diagnostic', () => {
    const c = multiTransitionChapter();
    delete c.meta.columnStarts;
    expect(() => chapterToPandocMarkdown(c, META)).toThrow(/more than one Bekker column transition/);
  });

  it('a column segment starting at line ≠ 1 stamps as a transition and addresses from the carried line', () => {
    const c = chapter({
      meta: {
        ...chapter().meta,
        spanStart: '1041a33',
        spanEnd: '1041b4',
        columnStarts: [
          { ref: '1041a33', rowIndex: 1 },
          { ref: '1041b3', rowIndex: 2 }, // real first line of the new column: 3, not 1
        ],
      },
      greekLines: ['g0', 'g1', 'g2'],
      englishLines: ['w0', 'w1', 'w2'],
    });
    const cols = chapterToPandocMarkdown(c, META, { stampMode: 'columns' });
    expect(cols.split('\n\n')[1].trimEnd()).toBe('w0 [1041b] w1 w2');
    const lines = chapterToPandocMarkdown(c, META, { stampMode: 'every-line' });
    expect(lines.split('\n\n')[1].trimEnd()).toBe('w0 [1041b3] w1 [1041b4] w2');
  });

  it('single-column chapter with column_starts behaves identically to the heuristic path', () => {
    const withCs = chapter({
      meta: { ...chapter().meta, columnStarts: [{ ref: '1041a6', rowIndex: 1 }] },
    });
    expect(chapterToPandocMarkdown(withCs, META)).toBe(chapterToPandocMarkdown(chapter(), META));
  });
});

describe('chapterToPandocMarkdown — inline markup conversion', () => {
  it('bold, italic, underline', () => {
    const c = chapter({ englishLines: ['**bold** *italic* ++underline++', '', '', '', ''] });
    const md = chapterToPandocMarkdown(c, META);
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('**bold** *italic* [underline]{.underline}');
  });

  it('Greek span renders as a language-tagged span with intact Unicode', () => {
    const c = chapter({ englishLines: ['{grc:τὸ τί ἦν εἶναι}', '', '', '', ''] });
    const md = chapterToPandocMarkdown(c, META);
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('[τὸ τί ἦν εἶναι]{lang=el-GR}');
  });

  it('footnote anchor becomes phrase[^id] at the phrase end', () => {
    const c = chapter({
      englishLines: ['the {^1:essence of it} matters', '', '', '', ''],
      footnotes: [{ id: 1, body: 'a note' }],
    });
    const md = chapterToPandocMarkdown(c, META);
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('the essence of it[^1] matters');
  });
});

describe('chapterToPandocMarkdown — escapes', () => {
  it('\\*literal\\* survives as literal asterisks, re-escaped for Pandoc', () => {
    const { markdown } = markupToPandoc('\\*literal\\*');
    expect(markdown).toBe('\\*literal\\*');
  });

  it('\\{ survives as a literal brace, not a span opener, and is NOT escaped for Pandoc (not special there)', () => {
    const { markdown } = markupToPandoc('\\{grc:not a span\\}');
    expect(markdown).toBe('{grc:not a span}');
  });

  it('a literal backslash round-trips through both escape layers', () => {
    const { markdown } = markupToPandoc('a\\\\b');
    expect(markdown).toBe('a\\\\b');
  });

  it('literal underscore and pandoc-special chars in plain text get escaped', () => {
    const { markdown } = markupToPandoc('a_b [c] d^e');
    expect(markdown).toBe('a\\_b \\[c\\] d\\^e');
  });
});

describe('chapterToPandocMarkdown — line splits (design doc D6, export)', () => {
  // Row index 2 (address 1041a8) carries a real Greek word boundary at
  // offset 6 (the space before "gamma-second") and a matching `¶` in its
  // English markup. Row 4 (1041a10, the every-5 stamp row) stays unsplit so
  // the stamp-once/skip-empty-segment cases can be layered on independently.
  function splitChapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
    return chapter({
      greekLines: ['g1', 'g2', 'gamma gamma-second', 'g4', 'g5'],
      englishLines: ['one', 'two', 'three¶four', 'five', 'six'],
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041a10',
        lineSplits: [{ ref: '1041a8', offset: 6 }],
      },
      ...overrides,
    });
  }

  it('an unsplit chapter renders byte-identically to before the feature (regression)', () => {
    const withNoSplits = chapter();
    const md = chapterToPandocMarkdown(withNoSplits, META);
    // Exactly one body paragraph (heading, body, nothing else joined by \n\n).
    expect(md.split('\n\n')).toHaveLength(2);
    const body = md.split('\n\n')[1].trimEnd();
    expect(body).toBe('one two three four [1041a10] five');
  });

  it('the paragraph break lands exactly at the split — two paragraphs, split at "three"/"four"', () => {
    const md = chapterToPandocMarkdown(splitChapter(), META);
    const parts = md.split('\n\n');
    // heading, paragraph 1, paragraph 2 (no footnotes here). Row 1041a10
    // (the last row, "six") is still the every-5 stamp row, unaffected by
    // the split earlier in the chapter.
    expect(parts).toHaveLength(3);
    expect(parts[1].trimEnd()).toBe('one two three');
    expect(parts[2].trimEnd()).toBe('four five [1041a10] six');
  });

  it('a two-split line yields three paragraphs', () => {
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
    const md = chapterToPandocMarkdown(c, META);
    const parts = md.split('\n\n');
    expect(parts).toHaveLength(4);
    expect(parts[1].trimEnd()).toBe('one two alpha');
    expect(parts[2].trimEnd()).toBe('beta');
    expect(parts[3].trimEnd()).toBe('gamma five [1041a10] six');
  });

  it('stamp fires once per address, on the first NON-EMPTY segment (segment 0 empty, segment 1 has text)', () => {
    // Row 1041a10 (index 4, the every-5 stamp row) is split; its FIRST
    // segment is empty (untranslated continuation start) and its SECOND
    // segment carries the row's actual text — the stamp must land on the
    // second segment, and only once (never duplicated).
    const c = chapter({
      greekLines: ['g1', 'g2', 'g3', 'g4', 'penta penta-second'],
      englishLines: ['one', 'two', 'three', 'four', '¶the fifth word'],
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041a10',
        lineSplits: [{ ref: '1041a10', offset: 6 }],
      },
    });
    const md = chapterToPandocMarkdown(c, META);
    // Exactly one stamp occurrence anywhere in the document.
    const stampCount = (md.match(/\[1041a10\]/g) ?? []).length;
    expect(stampCount).toBe(1);
    // It prefixes the second segment's text (the first segment being empty
    // produces no paragraph of its own — segment 0 contributes nothing, so
    // the split still creates a NEW group at segment 1, and since segment 0
    // was empty, that group is the only content from this row).
    expect(md).toContain('[1041a10] the fifth word');
  });

  it('footnotes resolve across the split (a footnote anchored in the second segment still gets its body block)', () => {
    const c = splitChapter({
      englishLines: ['one', 'two', 'three¶four {^1:with a note}', 'five', 'six'],
      footnotes: [{ id: 1, body: 'a note about "four"' }],
    });
    const md = chapterToPandocMarkdown(c, META);
    expect(md).toContain('four with a note[^1]');
    expect(md).toContain('[^1]: a note about');
    const parts = md.split('\n\n');
    expect(parts[1].trimEnd()).toBe('one two three');
  });

  it('bilingual-equivalent stamping and grouping also verified via compile.ts (see compile.test.ts) — here: stampMode every-line stamps only the first segment of a split row, never the continuation', () => {
    const md = chapterToPandocMarkdown(splitChapter(), META, { stampMode: 'every-line' });
    // 1041a8 is row index 2; every-line stamps every row except row 0.
    // The stamp must appear exactly once even though the row now has two
    // segments (never "[1041a8] three [1041a8] four").
    const stampCount = (md.match(/\[1041a8\]/g) ?? []).length;
    expect(stampCount).toBe(1);
    expect(md).toContain('[1041a8] three');
    expect(md).not.toContain('[1041a8] four');
  });
});

describe('chapterToPandocMarkdown — document-spine export (D8)', () => {
  it('paragraph docs use sentence-layer precedence, englishPara fallback, one ellipsis gap, and no addresses', () => {
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-paragraph',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶4',
        lineSplits: [{ ref: '¶1', offset: 13 }],
      },
      greekLines: ['Source one. Source two.', 'Source fallback.', 'Source blank.', 'Source after gap.'],
      englishLines: ['First sentence.¶Second sentence.', '', '', 'After gap.'],
      englishParaLines: ['Paragraph layer should lose.', 'Paragraph fallback.', '', ''],
      footnotes: [],
    };

    expect(chapterToPandocMarkdown(c, FREE_PARAGRAPH_META)).toBe(
      '# Free Paragraph\n\n' +
        'First sentence. Second sentence.\n\n' +
        'Paragraph fallback.\n\n' +
        '…\n\n' +
        'After gap.\n',
    );
  });

  it('paragraph-layer ⏎ tokens export as spaces for document-spine paragraph docs', () => {
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-paragraph',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶1',
      },
      greekLines: ['Source fallback.'],
      englishLines: [''],
      englishParaLines: ['Paragraph fallback⏎with a break.'],
      footnotes: [],
    };

    expect(chapterToPandocMarkdown(c, FREE_PARAGRAPH_META)).toBe(
      '# Free Paragraph\n\nParagraph fallback with a break.\n',
    );
  });

  it('plain-line docs break paragraphs at paragraphStarts and preserve line identity with Pandoc hard breaks', () => {
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-lines',
        book: 1,
        chapter: 1,
        citationScheme: 'plain-line',
        spanStart: '1',
        spanEnd: '3',
        paragraphStarts: [1, 3],
      },
      greekLines: ['L1', 'L2', 'L3'],
      englishLines: ['Line one', 'Line two', 'Line three'],
      footnotes: [],
    };

    expect(chapterToPandocMarkdown(c, FREE_LINE_META)).toBe(
      '# Free Lines\n\n' +
        'Line one\\\n' +
        'Line two\n\n' +
        'Line three\n',
    );
  });

  // Footnotes are a SENTENCE-LAYER feature (D8 v1 rule): marker markup in
  // [ENGLISH.PARA] renders as plain phrase text — no [^id] reference, no
  // footnote body pulled in — matching hydration, which strips the same
  // markers on load.
  it('paragraph-layer footnote markers are stripped at export: phrase as plain text, no reference, no body', () => {
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-paragraph',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶2',
      },
      greekLines: ['Source one.', 'Source two.'],
      englishLines: ['Sentence layer with a real {^1:anchor}.', ''],
      englishParaLines: ['', 'Para layer with a {^2:stray} marker.'],
      footnotes: [
        { id: 1, body: 'real note' },
        { id: 2, body: 'para-only note' },
      ],
    };
    const md = chapterToPandocMarkdown(c, FREE_PARAGRAPH_META);
    expect(md).toContain('anchor[^1]');
    expect(md).toContain('[^1]: real note');
    expect(md).toContain('Para layer with a stray marker.');
    expect(md).not.toContain('[^2]');
    expect(md).not.toContain('para-only note');
  });

  it('a marker-only paragraph line strips to nothing and counts as untranslated', () => {
    const c: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'free-paragraph',
        book: 1,
        chapter: 1,
        citationScheme: 'paragraph',
        spanStart: '¶1',
        spanEnd: '¶3',
      },
      greekLines: ['Source one.', 'Source two.', 'Source three.'],
      englishLines: ['First.', '', ''],
      englishParaLines: ['', '{^7:}', ''],
      footnotes: [],
    };
    // Row 2's para layer is decoration-only → an untranslated gap, exactly as
    // if the line were blank (one ellipsis between translated content — none
    // follows here, so no trailing ellipsis either).
    expect(chapterToPandocMarkdown(c, FREE_PARAGRAPH_META)).toBe('# Free Paragraph\n\nFirst.\n');
  });
});

describe('chapterToPandocMarkdown — corpus paragraph export', () => {
  function corpusParagraphChapter(overrides: Partial<ChapterFile> = {}): ChapterFile {
    return {
      meta: {
        schemaVersion: 1,
        work: 'isagoge',
        book: 1,
        chapter: 1,
        citationScheme: 'busse-paragraph',
        spanStart: '1.1',
        spanEnd: '1.2',
      },
      greekLines: ['Source first.', 'Source second.'],
      englishLines: ['', ''],
      englishParaLines: ['Para-layer first.', 'Para-layer second.'],
      footnotes: [],
      ...overrides,
    };
  }

  it('exports paragraph-layer English for corpus-spine paragraph works', () => {
    const md = chapterToPandocMarkdown(corpusParagraphChapter(), CORPUS_PARAGRAPH_META);
    expect(md).toBe('## Isagoge Book.1 (1.1–2)\n\nPara-layer first.\n\nPara-layer second.\n');
  });

  it('paragraph-layer ⏎ tokens export as spaces for corpus-spine paragraph docs', () => {
    const md = chapterToPandocMarkdown(
      corpusParagraphChapter({ englishParaLines: ['Para-layer⏎first.', 'Para-layer second.'] }),
      CORPUS_PARAGRAPH_META,
    );
    expect(md).toBe('## Isagoge Book.1 (1.1–2)\n\nPara-layer first.\n\nPara-layer second.\n');
  });

  it('bilingual paragraph rendering uses paragraph-layer English for corpus-spine paragraph works', () => {
    const md = documentToPandocMarkdown(corpusParagraphChapter(), CORPUS_PARAGRAPH_META, 'bilingual');
    expect(md).toBe(
      '# Isagoge\n\n' +
        'Source first.\n\n' +
        'Para-layer first.\n\n' +
        'Source second.\n\n' +
        'Para-layer second.\n',
    );
  });

  it('bilingual compile includes paragraph-layer English for corpus-spine paragraph works', () => {
    const result = compileWorkMarkdown([corpusParagraphChapter()], CORPUS_PARAGRAPH_META, { mode: 'bilingual' });
    expect(result.markdown).toBe(
      '# Book\n\n' +
        '## Chapter 1 (1.1–2)\n\n' +
        'Source first. Source second.\n\n' +
        'Para-layer first. Para-layer second.\n',
    );
  });

  it('bekker-line export stays on the sentence-layer path and ignores paragraph-layer text', () => {
    const base = chapter({
      meta: { ...chapter().meta, spanStart: '1041a6', spanEnd: '1041a7' },
      greekLines: ['g1', 'g2'],
      englishLines: ['Bekker sentence.', ''],
    });
    const withParagraphLayer = { ...base, englishParaLines: ['Ignored para one.', 'Ignored para two.'] };

    const expected = '## Metaphysics Ζ.17 (1041a6–7)\n\nBekker sentence.\n';
    expect(chapterToPandocMarkdown(base, META)).toBe(expected);
    expect(chapterToPandocMarkdown(withParagraphLayer, META)).toBe(expected);
  });
});

describe('chapterToPandocMarkdown — footnote blocks', () => {
  it('emits [^id]: body blocks at the end, only for footnotes actually referenced', () => {
    const c = chapter({
      englishLines: ['the {^1:cause} and {^2:effect}', '', '', '', ''],
      footnotes: [
        { id: 1, body: 'first note' },
        { id: 2, body: '**bold** note' },
      ],
    });
    const md = chapterToPandocMarkdown(c, META);
    expect(md).toContain('[^1]: first note');
    expect(md).toContain('[^2]: **bold** note');
  });

  it('omits an unanchored (unreferenced) footnote body', () => {
    const c = chapter({
      englishLines: ['the {^1:cause}', '', '', '', ''],
      footnotes: [
        { id: 1, body: 'referenced' },
        { id: 2, body: 'orphaned, never anchored in this chapter file' },
      ],
    });
    const md = chapterToPandocMarkdown(c, META);
    expect(md).toContain('[^1]: referenced');
    expect(md).not.toContain('orphaned');
  });

  it('multi-line footnote bodies render as an indented continuation block', () => {
    const c = chapter({
      englishLines: ['the {^1:cause}', '', '', '', ''],
      footnotes: [{ id: 1, body: 'first line\nsecond line' }],
    });
    const md = chapterToPandocMarkdown(c, META);
    expect(md).toContain('[^1]: first line\n    second line');
  });

  it('no [FOOTNOTES] section at all produces no trailing block', () => {
    const md = chapterToPandocMarkdown(chapter({ footnotes: [] }), META);
    expect(md).not.toMatch(/\[\^/);
  });
});

describe('stripLanguageSpans (markdown deliverable)', () => {
  it('unwraps language spans and leaves everything else alone', () => {
    const md = [
      'we must define what we mean by “said of all” ([τὸ κατὰ παντὸς]{lang=el-GR}),',
      'an [underlined phrase]{.underline} keeps its span,',
      'a footnote marker[^1] and a literal \\[bracketed\\]{lang=el-GR} escape survive,',
      'and nesting: [[τὸ καθόλου]{lang=el-GR}]{.underline}.',
    ].join('\n');
    expect(stripLanguageSpans(md)).toBe(
      [
        'we must define what we mean by “said of all” (τὸ κατὰ παντὸς),',
        'an [underlined phrase]{.underline} keeps its span,',
        'a footnote marker[^1] and a literal \\[bracketed\\]{lang=el-GR} escape survive,',
        'and nesting: [τὸ καθόλου]{.underline}.',
      ].join('\n'),
    );
  });

  it('leaves markdown with no language spans byte-identical', () => {
    const md = '# Title\n\nplain *english* text[^1]\n\n[^1]: a note\n';
    expect(stripLanguageSpans(md)).toBe(md);
  });
});
