import { describe, expect, it } from 'vitest';
import { parseChapterFile, serializeChapterFile } from '../index';
import type { ChapterFile } from '../types';

const baseFile = (headingTitleLines?: string[]): ChapterFile => ({
  meta: {
    schemaVersion: 1,
    work: 'summa',
    book: 1,
    chapter: 1,
    citationScheme: 'plain-line',
    spanStart: '1',
    spanEnd: '2',
  },
  greekLines: ['Articulus 1', 'Respondeo dicendum'],
  englishLines: ['Article 1', 'I answer that'],
  ...(headingTitleLines ? { headingTitleLines } : {}),
  footnotes: [],
});

describe('chapter-file [HEADING_TITLES] section', () => {
  it('serializes + parses per-row title overrides, byte-stable', () => {
    const file = baseFile(['', 'Corpus']); // row 1 no override, row 2 = "Corpus"
    const s = serializeChapterFile(file);
    expect(s).toContain('[HEADING_TITLES]\n\nCorpus');
    const back = parseChapterFile(s, 'ht');
    expect(back.headingTitleLines).toEqual(['', 'Corpus']);
    expect(serializeChapterFile(back)).toBe(s);
  });

  it('omits the section entirely when no row carries a title', () => {
    expect(serializeChapterFile(baseFile(['', '']))).not.toContain('[HEADING_TITLES]');
    expect(serializeChapterFile(baseFile())).not.toContain('[HEADING_TITLES]');
  });

  it('a file with no [HEADING_TITLES] parses to undefined', () => {
    const back = parseChapterFile(serializeChapterFile(baseFile()), 'none');
    expect(back.headingTitleLines).toBeUndefined();
  });

  it('rejects a [HEADING_TITLES] whose line count differs from the rows', () => {
    const bad = `---
schema_version: 1
work: summa
book: 1
chapter: 1
citation_scheme: plain-line
span_start: "1"
span_end: "2"
---
[GREEK]
Articulus 1
Respondeo dicendum

[ENGLISH]
Article 1
I answer that

[HEADING_TITLES]
only-one
`;
    expect(() => parseChapterFile(bad, 'bad')).toThrow(/HEADING_TITLES/);
  });
});
