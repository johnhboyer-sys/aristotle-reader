import { describe, expect, it } from 'vitest';
import { ChapterFileError, parseChapterFile, serializeChapterFile, rowAddress, isValidSplitOffset } from '../index';
import type { ChapterFile, ChapterFileMeta, ColumnStart } from '../types';

// Canonical serialized shape: one structural blank line after each section's
// content when another section follows (the parser drops exactly one trailing
// blank per section), so empty content rows survive the round trip.
const SAMPLE = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041b33"
---
[GREEK]
τὸ τί ἦν εἶναι πρῶτον
καὶ τὸ αἴτιον

[ENGLISH]
**the essence** first
and the cause

[FOOTNOTES]
1: footnote body text…
2: another note…
`;

// Older serializer output: no structural blanks between sections. Must keep
// parsing identically (existing files on disk).
const SAMPLE_OLD_SHAPE = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041b33"
---
[GREEK]
τὸ τί ἦν εἶναι πρῶτον
καὶ τὸ αἴτιον
[ENGLISH]
**the essence** first
and the cause
[FOOTNOTES]
1: footnote body text…
2: another note…
`;

describe('parseChapterFile', () => {
  it('parses frontmatter into a typed ChapterFileMeta', () => {
    const doc = parseChapterFile(SAMPLE);
    expect(doc.meta).toEqual({
      schemaVersion: 1,
      work: 'metaphysics',
      book: 7,
      chapter: 17,
      citationScheme: 'bekker-metaphysics',
      spanStart: '1041a6',
      spanEnd: '1041b33',
    });
  });

  it('parses greekLines and englishLines as raw markup strings, one per Bekker line', () => {
    const doc = parseChapterFile(SAMPLE);
    expect(doc.greekLines).toEqual(['τὸ τί ἦν εἶναι πρῶτον', 'καὶ τὸ αἴτιον']);
    expect(doc.englishLines).toEqual(['**the essence** first', 'and the cause']);
  });

  it('parses footnotes with ids and bodies', () => {
    const doc = parseChapterFile(SAMPLE);
    expect(doc.footnotes).toEqual([
      { id: 1, body: 'footnote body text…' },
      { id: 2, body: 'another note…' },
    ]);
  });

  it('still parses the pre-structural-blank shape (older files on disk) identically', () => {
    expect(parseChapterFile(SAMPLE_OLD_SHAPE)).toEqual(parseChapterFile(SAMPLE));
  });

  it('handles an absent (optional) [FOOTNOTES] section', () => {
    const noFootnotes = `---
schema_version: 1
work: posterior-analytics
book: 2
chapter: 19
citation_scheme: bekker-standard
span_start: "100a3"
span_end: "100b5"
---
[GREEK]
line one
[ENGLISH]
line one english
`;
    const doc = parseChapterFile(noFootnotes);
    expect(doc.footnotes).toEqual([]);
  });

  it('handles an empty [FOOTNOTES] section (header present, no entries)', () => {
    const emptyFootnotes = `---
schema_version: 1
work: posterior-analytics
book: 2
chapter: 19
citation_scheme: bekker-standard
span_start: "100a3"
span_end: "100b5"
---
[GREEK]
line one
[ENGLISH]
line one english
[FOOTNOTES]
`;
    const doc = parseChapterFile(emptyFootnotes);
    expect(doc.footnotes).toEqual([]);
  });

  it('supports multi-line footnote bodies via continuation lines', () => {
    const multiline = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
[ENGLISH]
line one english
[FOOTNOTES]
1: first line of note one
continued on a second line
and a third
2: note two, single line
`;
    const doc = parseChapterFile(multiline);
    expect(doc.footnotes).toEqual([
      { id: 1, body: 'first line of note one\ncontinued on a second line\nand a third' },
      { id: 2, body: 'note two, single line' },
    ]);
  });

  it('throws a clear error when [GREEK]/[ENGLISH] line counts mismatch, including both counts', () => {
    const mismatched = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
line two
[ENGLISH]
line one english
`;
    expect(() => parseChapterFile(mismatched)).toThrow(ChapterFileError);
    try {
      parseChapterFile(mismatched);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('2');
      expect((err as Error).message).toContain('1');
      expect((err as Error).message).toMatch(/\[GREEK\]/);
      expect((err as Error).message).toMatch(/\[ENGLISH\]/);
    }
  });

  it('throws on duplicate footnote ids', () => {
    const dup = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
[ENGLISH]
line one english
[FOOTNOTES]
1: first
1: duplicate
`;
    expect(() => parseChapterFile(dup)).toThrow(/duplicate footnote id/);
  });

  it('throws on a non-positive footnote id', () => {
    const bad = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
[ENGLISH]
line one english
[FOOTNOTES]
0: bad id
`;
    expect(() => parseChapterFile(bad)).toThrow(/positive integer/);
  });

  it('throws a clear error on an unknown citation_scheme', () => {
    const bad = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: not-a-real-scheme
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
[ENGLISH]
line one english
`;
    expect(() => parseChapterFile(bad)).toThrow(/unknown/i);
  });

  it('throws when span_start does not parse under the declared scheme', () => {
    const bad = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "not-a-ref"
span_end: "1041a6"
---
[GREEK]
line one
[ENGLISH]
line one english
`;
    expect(() => parseChapterFile(bad)).toThrow(/span_start/);
  });

  it('throws when the frontmatter block is missing', () => {
    expect(() => parseChapterFile('[GREEK]\nfoo\n[ENGLISH]\nbar\n')).toThrow(/frontmatter/i);
  });

  it('throws when required sections are missing', () => {
    const noEnglish = `---
schema_version: 1
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
`;
    expect(() => parseChapterFile(noEnglish)).toThrow(/\[ENGLISH\]/);
  });
});

describe('serializeChapterFile', () => {
  it('produces the documented format byte-for-byte for the sample doc', () => {
    const doc = parseChapterFile(SAMPLE);
    const out = serializeChapterFile(doc);
    expect(out).toBe(SAMPLE);
  });
});

// ── U+2028/U+2029 hardening ──────────────────────────────────────────────────
//
// A hand-authored footnote body pasted from a word processor/PDF can carry a
// literal U+2028 LINE SEPARATOR or U+2029 PARAGRAPH SEPARATOR instead of "\n".
// `String.prototype.split('\n')` does NOT split on these, but the parser's
// FOOTNOTE_ENTRY_RE (`/^(\d+):[ \t](.*)$/`) treats them as line terminators
// (JS regex `^`/`$`/`.` semantics) — so a body containing one fails to match
// as a footnote entry, silently merging into (or being rejected as) garbage on
// round-trip. Imports are already safe (Stage 0's scrivenerMd.ts normalizes
// these before they ever reach the chapter-file format); hand-authored bodies
// typed/pasted directly into the editor are not.
describe('U+2028 / U+2029 in footnote bodies', () => {
  const LS = ' ';
  const PS = ' ';

  function docWithFootnoteBody(body: string): ChapterFile {
    return {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041a6',
      },
      greekLines: ['line one'],
      englishLines: ['line one english'],
      footnotes: [{ id: 1, body }],
    };
  }

  it('round-trips a footnote body containing U+2028 without merging/losing structure', () => {
    const doc = docWithFootnoteBody(`first physical line${LS}second physical line, no colon here`);
    const serialized = serializeChapterFile(doc);
    const reparsed = parseChapterFile(serialized);
    // The body must not silently swallow the separator into a single run of
    // text that loses the author's intended break.
    expect(reparsed.footnotes[0].body).not.toBe('first physical line second physical line, no colon here');
    // Round-trip must be stable (idempotent on repeated serialize/parse).
    expect(serializeChapterFile(reparsed)).toBe(serialized);
  });

  it('round-trips a footnote body containing U+2029', () => {
    const doc = docWithFootnoteBody(`first paragraph${PS}second paragraph`);
    const serialized = serializeChapterFile(doc);
    const reparsed = parseChapterFile(serialized);
    expect(reparsed.footnotes[0].body).not.toBe('first paragraph second paragraph');
    expect(serializeChapterFile(reparsed)).toBe(serialized);
  });

  it('a footnote body whose U+2028-joined halves form a "N: "-shaped line round-trips as a stable, well-formed file (no crash, no lost content)', () => {
    // This is the reported failure mode verbatim: WITHOUT the fix, the merged
    // text (U+2028 not treated as a line break by split('\n'), but treated as
    // one by the parser's regex `^`/`$`) throws "footnote continuation line
    // before any N: entry" on reparse — a hard crash on a file the app itself
    // just wrote. With the fix, U+2028 folds to a real paragraph break, so the
    // line legitimately starts a new footnote entry — the SAME ambiguity a
    // hand-typed body with a literal "\n2: ..." line already has today
    // (pre-existing, independent of U+2028; out of scope here). What matters
    // for THIS bug is: no crash, no silent loss, and a stable round-trip.
    const doc = docWithFootnoteBody(`para one${LS}2: fake entry looking line`);
    const serialized = serializeChapterFile(doc);
    const reparsed = parseChapterFile(serialized);
    const bodies = reparsed.footnotes.map((fn) => fn.body).join('\n');
    expect(bodies).toContain('para one');
    expect(bodies).toContain('fake entry looking line');
    expect(serializeChapterFile(reparsed)).toBe(serialized);
  });

  it('normalizes U+2028/U+2029 the same way Stage 0 import does (fold to a paragraph break), never emitting the raw separator into a saved file', () => {
    const doc = docWithFootnoteBody(`alpha${LS}beta${PS}gamma`);
    const serialized = serializeChapterFile(doc);
    expect(serialized).not.toContain(LS);
    expect(serialized).not.toContain(PS);
  });
});

describe('round-trip property: parse(serialize(doc)) equals doc', () => {
  const cases: ChapterFile[] = [
    {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041b33',
      },
      greekLines: ['πρῶτον', 'δεύτερον'],
      englishLines: ['**first**', 'second'],
      footnotes: [
        { id: 1, body: 'a note' },
        { id: 2, body: 'multi\nline\nbody' },
      ],
    },
    {
      meta: {
        schemaVersion: 1,
        work: 'posterior-analytics',
        book: 2,
        chapter: 19,
        citationScheme: 'bekker-standard',
        spanStart: '100a3',
        spanEnd: '100a3',
      },
      greekLines: ['single line'],
      englishLines: ['single line english'],
      footnotes: [],
    },
    {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 1,
        chapter: 1,
        citationScheme: 'bekker-metaphysics',
        spanStart: '980a21',
        spanEnd: '980a21',
      },
      greekLines: [],
      englishLines: [],
      footnotes: [],
    },
    // THE reported round-trip bug: final [ENGLISH] row empty (untranslated —
    // the common case) with [FOOTNOTES] following. The old serializer's
    // output lost that row to the parser's structural-blank trim.
    {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041a8',
      },
      greekLines: ['πρῶτον', 'δεύτερον', 'τρίτον'],
      englishLines: ['first', '', ''],
      footnotes: [{ id: 1, body: 'a note' }],
    },
    // Trailing empty english row at EOF (no footnotes).
    {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041a7',
      },
      greekLines: ['πρῶτον', 'δεύτερον'],
      englishLines: ['', ''],
      footnotes: [],
    },
    // Empty GREEK/ENGLISH sections WITH footnotes.
    {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 1,
        chapter: 1,
        citationScheme: 'bekker-metaphysics',
        spanStart: '980a21',
        spanEnd: '980a21',
      },
      greekLines: [],
      englishLines: [],
      footnotes: [{ id: 3, body: 'note without any rows' }],
    },
    // Multi-line footnote bodies including trailing-newline bodies.
    {
      meta: {
        schemaVersion: 1,
        work: 'posterior-analytics',
        book: 2,
        chapter: 19,
        citationScheme: 'bekker-standard',
        spanStart: '100a3',
        spanEnd: '100a4',
      },
      greekLines: ['α', 'β'],
      englishLines: ['a', 'b'],
      footnotes: [
        { id: 1, body: 'ends with a blank continuation\n' },
        { id: 2, body: 'plain' },
      ],
    },
    // column_starts round-trips through the frontmatter.
    {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a33',
        spanEnd: '1041b2',
        columnStarts: [
          { ref: '1041a33', rowIndex: 1 },
          { ref: '1041b1', rowIndex: 2 },
        ],
      },
      greekLines: ['α', 'β', 'γ'],
      englishLines: ['a', 'b', ''],
      footnotes: [{ id: 1, body: 'note' }],
    },
  ];

  it.each(cases.map((doc, i) => [i, doc] as const))('round-trips case %i', (_i, doc) => {
    const serialized = serializeChapterFile(doc);
    const reparsed = parseChapterFile(serialized);
    expect(reparsed).toEqual(doc);
    // Serializing the reparsed doc again must be byte-identical (idempotent).
    expect(serializeChapterFile(reparsed)).toBe(serialized);
  });

  it('normalizes CRLF line endings to \\n on parse, then round-trips cleanly', () => {
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    const doc = parseChapterFile(crlf);
    expect(serializeChapterFile(doc)).toBe(SAMPLE);
  });
});

// ── column_starts ────────────────────────────────────────────────────────────

function fileWith(frontmatterExtra: string, greek: string[], english: string[]): string {
  return [
    '---',
    'schema_version: 1',
    'work: metaphysics',
    'book: 7',
    'chapter: 17',
    'citation_scheme: bekker-metaphysics',
    'span_start: "1041a6"',
    'span_end: "1041b2"',
    ...(frontmatterExtra ? [frontmatterExtra] : []),
    '---',
    '[GREEK]',
    ...greek,
    '',
    '[ENGLISH]',
    ...english,
    '',
  ].join('\n');
}

describe('column_starts parsing + validation', () => {
  const greek = ['α', 'β', 'γ', 'δ'];
  const english = ['a', 'b', 'c', 'd'];

  it('parses comma-separated <columnRef>@<rowIndex> pairs into meta.columnStarts', () => {
    const doc = parseChapterFile(fileWith('column_starts: "1041a6@1,1041b1@3"', greek, english));
    expect(doc.meta.columnStarts).toEqual([
      { ref: '1041a6', rowIndex: 1 },
      { ref: '1041b1', rowIndex: 3 },
    ]);
  });

  it('a file without column_starts parses with the field absent (older files)', () => {
    const doc = parseChapterFile(fileWith('', greek, english));
    expect(doc.meta.columnStarts).toBeUndefined();
  });

  it('a later column need not start at line 1 — the carried line number is preserved', () => {
    const doc = parseChapterFile(fileWith('column_starts: "1041a6@1,1041b4@3"', greek, english));
    expect(doc.meta.columnStarts![1]).toEqual({ ref: '1041b4', rowIndex: 3 });
  });

  it("rejects a first pair whose ref differs from span_start, with the frontmatter line number", () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a7@1,1041b1@3"', greek, english), 'f.md')).toThrow(
      /f\.md: line 9: column_starts first pair's ref \("1041a7"\) must equal span_start/,
    );
  });

  it('rejects a first pair whose row index is not 1', () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a6@2"', greek, english))).toThrow(
      /first pair must have row index 1/,
    );
  });

  it('rejects non-strictly-increasing row indexes', () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a6@1,1041b1@3,1042a1@3"', greek, english))).toThrow(
      /strictly increasing/,
    );
  });

  it('rejects a row index beyond the chapter row count', () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a6@1,1041b1@5"', greek, english), 'f.md')).toThrow(
      /line 9: column_starts row index 5 is out of range — the chapter has 4 row\(s\)/,
    );
  });

  it('rejects a malformed pair', () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a6@1,1041b1"', greek, english))).toThrow(
      /pair 2 .* is not of the form <columnRef>@<rowIndex>/,
    );
  });

  it('rejects a ref without a trailing line number', () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a6@1,1041b@3"', greek, english))).toThrow(
      /does not (end in a line number|parse under scheme)/,
    );
  });

  it('rejects a ref that does not parse under the declared scheme', () => {
    expect(() => parseChapterFile(fileWith('column_starts: "1041a6@1,junk9@3"', greek, english))).toThrow(
      /does not parse under scheme/,
    );
  });

  it('rejects an empty column_starts value', () => {
    expect(() => parseChapterFile(fileWith('column_starts: ""', greek, english))).toThrow(/non-empty string/);
  });

  it('serialize emits the flat scalar string after span_end', () => {
    const doc = parseChapterFile(fileWith('column_starts: "1041a6@1,1041b1@3"', greek, english));
    expect(serializeChapterFile(doc)).toContain('span_end: "1041b2"\ncolumn_starts: "1041a6@1,1041b1@3"\n---');
  });

  it('serialize refuses an empty columnStarts array (would silently become "absent")', () => {
    const doc = parseChapterFile(fileWith('', greek, english));
    doc.meta.columnStarts = [];
    expect(() => serializeChapterFile(doc)).toThrow(ChapterFileError);
  });
});

describe('rowAddress', () => {
  const meta = (columnStarts?: ColumnStart[]): ChapterFileMeta => ({
    schemaVersion: 1,
    work: 'metaphysics',
    book: 7,
    chapter: 17,
    citationScheme: 'bekker-metaphysics',
    spanStart: '1041a6',
    spanEnd: '1042b3',
    ...(columnStarts ? { columnStarts } : {}),
  });

  it('walks a single segment by pure line arithmetic from the first ref', () => {
    const m = meta([{ ref: '1041a6', rowIndex: 1 }]);
    expect(rowAddress(m, 1)).toBe('1041a6');
    expect(rowAddress(m, 2)).toBe('1041a7');
    expect(rowAddress(m, 28)).toBe('1041a33');
  });

  it('is exact across many column transitions', () => {
    const m = meta([
      { ref: '1041a6', rowIndex: 1 },
      { ref: '1041b1', rowIndex: 29 },
      { ref: '1042a1', rowIndex: 66 },
      { ref: '1042b1', rowIndex: 103 },
    ]);
    expect(rowAddress(m, 28)).toBe('1041a33');
    expect(rowAddress(m, 29)).toBe('1041b1');
    expect(rowAddress(m, 65)).toBe('1041b37');
    expect(rowAddress(m, 66)).toBe('1042a1');
    expect(rowAddress(m, 102)).toBe('1042a37');
    expect(rowAddress(m, 103)).toBe('1042b1');
    expect(rowAddress(m, 110)).toBe('1042b8');
  });

  it('does NOT assume a segment starts at line 1 — the carried line is used', () => {
    const m = meta([
      { ref: '1041a6', rowIndex: 1 },
      { ref: '1041b3', rowIndex: 4 },
    ]);
    expect(rowAddress(m, 4)).toBe('1041b3');
    expect(rowAddress(m, 5)).toBe('1041b4');
  });

  it('throws when the meta has no column_starts (older files)', () => {
    expect(() => rowAddress(meta(undefined), 1)).toThrow(ChapterFileError);
    expect(() => rowAddress(meta(undefined), 1)).toThrow(/no column_starts/);
  });

  it('throws on a row index below the first segment', () => {
    const m = meta([{ ref: '1041a6', rowIndex: 1 }]);
    expect(() => rowAddress(m, 0)).toThrow(/out of range/);
    expect(() => rowAddress(m, 1.5)).toThrow(/out of range/);
  });
});

// ── seeded round-trip property test ──────────────────────────────────────────
//
// Random docs over: row counts 0..12 with empty rows at random positions
// (trailing-empty english rows are the reported-bug shape and get extra
// weight), optional footnotes with multi-line bodies (including
// trailing-newline bodies), optional column_starts. Asserts
// parse(serialize(x)) deep-equals x and byte-idempotence.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('round-trip property (seeded generator)', () => {
  const WORDS = ['λόγος', 'οὐσία', 'first', 'cause', '**bold**', '*ital*', 'x y z', '{grc:τί}', '  padded  ', 'a: colon'];

  function generate(rand: () => number): ChapterFile {
    const int = (n: number) => Math.floor(rand() * n);
    const pick = <T>(arr: T[]): T => arr[int(arr.length)];

    const rowCount = int(13); // 0..12
    const contentLine = () => (rand() < 0.3 ? '' : pick(WORDS));
    const greekLines = Array.from({ length: rowCount }, contentLine);
    const englishLines = Array.from({ length: rowCount }, contentLine);
    // Weight the reported-bug shape: force a trailing empty english row often.
    if (rowCount > 0 && rand() < 0.5) englishLines[rowCount - 1] = '';

    const footnoteCount = rand() < 0.3 ? 0 : int(4);
    const footnotes = Array.from({ length: footnoteCount }, (_, i) => {
      const lineCount = 1 + int(3);
      // Continuation lines must not look like a "N: " entry — the generator
      // stays inside the format's representable space, like real markup does.
      const body = Array.from({ length: lineCount }, () => (rand() < 0.25 ? '' : pick(WORDS))).join('\n');
      return { id: i + 1, body };
    });

    const page = 980 + int(100);
    const side = rand() < 0.5 ? 'a' : 'b';
    const startLine = 1 + int(30);
    const spanStart = `${page}${side}${startLine}`;
    const spanEnd = `${page + int(2)}${rand() < 0.5 ? 'a' : 'b'}${1 + int(38)}`;

    let columnStarts: ColumnStart[] | undefined;
    if (rowCount > 0 && rand() < 0.5) {
      columnStarts = [{ ref: spanStart, rowIndex: 1 }];
      let nextPage = page;
      let nextSideIsB = side === 'a';
      for (let rowIndex = 2; rowIndex <= rowCount; rowIndex++) {
        if (rand() < 0.25) {
          const ref = `${nextSideIsB ? nextPage : nextPage + 1}${nextSideIsB ? 'b' : 'a'}${1 + int(3)}`;
          columnStarts.push({ ref, rowIndex });
          if (!nextSideIsB) nextPage += 1;
          nextSideIsB = !nextSideIsB;
        }
      }
    }

    return {
      meta: {
        schemaVersion: 1,
        work: rand() < 0.5 ? 'metaphysics' : 'meta',
        book: 1 + int(14),
        chapter: 1 + int(30),
        citationScheme: 'bekker-metaphysics',
        spanStart,
        spanEnd,
        ...(columnStarts ? { columnStarts } : {}),
      },
      greekLines,
      englishLines,
      footnotes,
    };
  }

  it('parse(serialize(x)) deep-equals x for 400 seeded random docs, byte-idempotently', () => {
    const rand = mulberry32(0xa71570); // fixed seed — deterministic corpus
    for (let i = 0; i < 400; i++) {
      const doc = generate(rand);
      const serialized = serializeChapterFile(doc);
      let reparsed: ChapterFile;
      try {
        reparsed = parseChapterFile(serialized, `case-${i}`);
      } catch (err) {
        throw new Error(`case ${i}: reparse failed: ${(err as Error).message}\n---doc---\n${JSON.stringify(doc)}\n---file---\n${serialized}`);
      }
      expect(reparsed, `case ${i}\n${serialized}`).toEqual(doc);
      expect(serializeChapterFile(reparsed), `case ${i} not byte-idempotent`).toBe(serialized);
    }
  });
});

// ── line_splits (design doc D6, slice 1) ─────────────────────────────────────
//
// The parser owns STRUCTURE (pair shape, scheme-parseable refs, positive
// strictly-ascending offsets per address) and byte-stable round-tripping;
// whether an offset lands in range / at a word boundary of its row's Greek is
// hydration's job (library/autosave.ts drift policy) and must NOT throw here.

describe('line_splits parsing + validation', () => {
  const greek = ['ἡ οὐσία', 'τὸ αἴτιον· καὶ ἡ ἀρχή', 'γ', 'δ'];
  const english = ['a', 'first part¶second part', 'c', 'd'];

  it('parses comma-separated <address>@<offset> pairs into meta.lineSplits', () => {
    const doc = parseChapterFile(fileWith('line_splits: "1041a7@3,1041a7@11"', greek, english));
    expect(doc.meta.lineSplits).toEqual([
      { ref: '1041a7', offset: 3 },
      { ref: '1041a7', offset: 11 },
    ]);
  });

  it('a file without line_splits parses with the field absent (unsplit files)', () => {
    const doc = parseChapterFile(fileWith('', greek, english));
    expect(doc.meta.lineSplits).toBeUndefined();
  });

  it('serializes byte-stably: parse(file) → serialize is byte-identical, and the field sits after column_starts', () => {
    const file = fileWith('column_starts: "1041a6@1,1041b1@3"\nline_splits: "1041a7@3"', greek, english);
    const doc = parseChapterFile(file);
    expect(serializeChapterFile(doc)).toBe(file);
    expect(serializeChapterFile(doc)).toContain('column_starts: "1041a6@1,1041b1@3"\nline_splits: "1041a7@3"\n---');
  });

  it('rejects a malformed pair, with the frontmatter line number', () => {
    expect(() => parseChapterFile(fileWith('line_splits: "1041a7@3,1041a8"', greek, english), 'f.md')).toThrow(
      /f\.md: line 9: line_splits pair 2 .* is not of the form <address>@<offset>/,
    );
  });

  it('rejects a zero offset (an offset is a positive integer)', () => {
    expect(() => parseChapterFile(fileWith('line_splits: "1041a7@0"', greek, english))).toThrow(
      /offset must be a positive integer/,
    );
  });

  it('rejects an address that does not parse under the declared scheme', () => {
    expect(() => parseChapterFile(fileWith('line_splits: "junk@3"', greek, english))).toThrow(
      /does not parse under scheme/,
    );
  });

  it('rejects non-ascending offsets at a shared address', () => {
    expect(() => parseChapterFile(fileWith('line_splits: "1041a7@11,1041a7@3"', greek, english))).toThrow(
      /strictly ascending/,
    );
    expect(() => parseChapterFile(fileWith('line_splits: "1041a7@3,1041a7@3"', greek, english))).toThrow(
      /strictly ascending/,
    );
  });

  it('rejects an empty line_splits value', () => {
    expect(() => parseChapterFile(fileWith('line_splits: ""', greek, english))).toThrow(/non-empty string/);
  });

  it('does NOT reject a well-formed but semantically drifted offset (out of range / mid-word) — that is hydration policy, and the pairs round-trip verbatim', () => {
    // 999 is far beyond any row's Greek; 2 sits mid-word in 'ἡ οὐσία'.
    const file = fileWith('line_splits: "1041a6@2,1041a7@999"', greek, english);
    const doc = parseChapterFile(file);
    expect(doc.meta.lineSplits).toEqual([
      { ref: '1041a6', offset: 2 },
      { ref: '1041a7', offset: 999 },
    ]);
    expect(serializeChapterFile(doc)).toBe(file);
  });

  it('serialize refuses an empty lineSplits array (would silently become "absent")', () => {
    const doc = parseChapterFile(fileWith('', greek, english));
    doc.meta.lineSplits = [];
    expect(() => serializeChapterFile(doc)).toThrow(ChapterFileError);
  });

  it('round-trip property: a doc with lineSplits and ¶ english lines deep-equals through parse(serialize(x)), byte-idempotently', () => {
    const doc: ChapterFile = {
      meta: {
        schemaVersion: 1,
        work: 'metaphysics',
        book: 7,
        chapter: 17,
        citationScheme: 'bekker-metaphysics',
        spanStart: '1041a6',
        spanEnd: '1041a8',
        columnStarts: [{ ref: '1041a6', rowIndex: 1 }],
        lineSplits: [
          { ref: '1041a6', offset: 2 },
          { ref: '1041a6', offset: 5 },
          { ref: '1041a8', offset: 3 },
        ],
      },
      greekLines: ['ἡ γὰρ ἀρχή', 'τὸ αἴτιον', 'ἡ οὐσία πρώτη'],
      englishLines: ['one¶two¶three', 'no split here', 'tail is empty¶'],
      footnotes: [{ id: 1, body: 'a note' }],
    };
    const serialized = serializeChapterFile(doc);
    const reparsed = parseChapterFile(serialized);
    expect(reparsed).toEqual(doc);
    expect(serializeChapterFile(reparsed)).toBe(serialized);
  });
});

describe('isValidSplitOffset (semantic offset validity, code units)', () => {
  const greek = 'ἡ γὰρ ἀρχή'; // word gaps after code units 2 and 6

  it('accepts an in-range offset whose preceding character is a word gap', () => {
    expect(isValidSplitOffset(greek, 2)).toBe(true); // before 'γὰρ'
    expect(isValidSplitOffset(greek, 6)).toBe(true); // before 'ἀρχή'
  });

  it('rejects offsets at or beyond the ends (0 < offset < length)', () => {
    expect(isValidSplitOffset(greek, 0)).toBe(false);
    expect(isValidSplitOffset(greek, greek.length)).toBe(false);
    expect(isValidSplitOffset(greek, 999)).toBe(false);
    expect(isValidSplitOffset(greek, -1)).toBe(false);
    expect(isValidSplitOffset(greek, 2.5)).toBe(false);
  });

  it('rejects a mid-word offset (character before it is a letter)', () => {
    expect(isValidSplitOffset(greek, 1)).toBe(false); // after 'ἡ' but before its space
    expect(isValidSplitOffset(greek, 4)).toBe(false); // inside 'γὰρ'
  });

  it('rejects an offset right after a combining mark (never splits a grapheme)', () => {
    const combining = 'αβ́ γ'; // β + combining acute
    expect(isValidSplitOffset(combining, 3)).toBe(false); // char before is U+0301
    expect(isValidSplitOffset(combining, 4)).toBe(true); // char before is the space
  });

  it('accepts a split after punctuation such as the ano teleia', () => {
    const line = 'τὸ αἴτιον· καὶ ἡ ἀρχή';
    expect(isValidSplitOffset(line, line.indexOf('·') + 1)).toBe(true); // directly after '·'
    expect(isValidSplitOffset(line, line.indexOf('·') + 2)).toBe(true); // after '· '
    expect(isValidSplitOffset(line, line.indexOf('·'))).toBe(false); // char before is a letter
  });
});

// ── schema_version guard (d6 divergence C) ───────────────────────────────────

describe('schema_version guard', () => {
  function fileWithVersion(version: number): string {
    return `---
schema_version: ${version}
work: metaphysics
book: 7
chapter: 17
citation_scheme: bekker-metaphysics
span_start: "1041a6"
span_end: "1041a6"
---
[GREEK]
line one
[ENGLISH]
line one english
`;
  }

  it('refuses schema_version 2 with one plain sentence', () => {
    expect(() => parseChapterFile(fileWithVersion(2))).toThrow(ChapterFileError);
    expect(() => parseChapterFile(fileWithVersion(2))).toThrow(
      /This chapter was saved by a newer version of the app — update the app to open it\./,
    );
  });

  it('accepts schema_version 1 (with or without line_splits — the feature is additive)', () => {
    expect(() => parseChapterFile(fileWithVersion(1))).not.toThrow();
    const withSplits = fileWithVersion(1).replace('---\n[GREEK]', 'line_splits: "1041a6@3"\n---\n[GREEK]');
    expect(parseChapterFile(withSplits).meta.lineSplits).toEqual([{ ref: '1041a6', offset: 3 }]);
  });
});
