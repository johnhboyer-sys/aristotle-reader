import { describe, expect, it } from 'vitest';
import { parseChapterFile, serializeChapterFile, sanitizeHeaders } from '../index';

// A minimal 2-row document with a `headers` frontmatter line spliced in.
const withHeaders = (headersLine: string) => `---
schema_version: 1
work: summa
book: 1
chapter: 1
citation_scheme: plain-line
span_start: "1"
span_end: "2"
${headersLine ? headersLine + '\n' : ''}---
[GREEK]
Articulus 1
Respondeo dicendum

[ENGLISH]
Article 1
I answer that
`;

describe('sanitizeHeaders', () => {
  it('parses row:level pairs and sorts by row', () => {
    expect(sanitizeHeaders('5:1,2:2')).toEqual([
      { row: 2, level: 2 },
      { row: 5, level: 1 },
    ]);
  });

  it('drops junk tokens, level-0, non-positive rows, and duplicate rows', () => {
    // "x" junk; "3:0" level 0 invalid (dropped) BEFORE the valid "3:1"; "0:1" non-positive row.
    expect(sanitizeHeaders('x,3:0,3:1,0:1,4:2')).toEqual([
      { row: 3, level: 1 },
      { row: 4, level: 2 },
    ]);
  });

  it('keeps only the first role seen for a repeated row', () => {
    expect(sanitizeHeaders('3:1,3:2')).toEqual([{ row: 3, level: 1 }]);
  });

  it('accepts deep levels (≥3) now that tiers are profile-driven, not 1|2', () => {
    expect(sanitizeHeaders('2:3,5:7')).toEqual([
      { row: 2, level: 3 },
      { row: 5, level: 7 },
    ]);
    // level 0 is still invalid (levels are 1-based).
    expect(sanitizeHeaders('2:0,3:2')).toEqual([{ row: 3, level: 2 }]);
  });

  it('returns undefined when nothing survives or the value is not a string', () => {
    expect(sanitizeHeaders('nonsense')).toBeUndefined();
    expect(sanitizeHeaders('')).toBeUndefined();
    expect(sanitizeHeaders(undefined)).toBeUndefined();
    expect(sanitizeHeaders({})).toBeUndefined();
  });
});

describe('chapter-file headers frontmatter', () => {
  it('parses headers into typed HeaderMarks', () => {
    const doc = parseChapterFile(withHeaders('headers: "1:1,2:2"'));
    expect(doc.meta.headers).toEqual([
      { row: 1, level: 1 },
      { row: 2, level: 2 },
    ]);
  });

  it('round-trips byte-stably through serialize', () => {
    const src = withHeaders('headers: "1:1,2:2"');
    expect(serializeChapterFile(parseChapterFile(src))).toBe(src);
  });

  it('drops out-of-range rows against the row count', () => {
    // 2-row file; row 5 has no line and is filtered.
    const doc = parseChapterFile(withHeaders('headers: "1:1,5:2"'));
    expect(doc.meta.headers).toEqual([{ row: 1, level: 1 }]);
  });

  it('omits the key entirely when every entry is out of range', () => {
    const doc = parseChapterFile(withHeaders('headers: "7:1,9:2"'));
    expect(doc.meta.headers).toBeUndefined();
  });

  it('a file with no headers line has undefined headers', () => {
    const doc = parseChapterFile(withHeaders(''));
    expect(doc.meta.headers).toBeUndefined();
  });
});
