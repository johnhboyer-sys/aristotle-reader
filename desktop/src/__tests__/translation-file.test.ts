import { describe, expect, it } from 'vitest';
import {
  auditChapterKeys,
  columnKey,
  parseTranslationFile,
  serializeFrontmatter,
  slugId,
  splitChapters,
  type TranslationMeta,
} from '../lib/translation-file';

describe('translation-file', () => {
  it('parses frontmatter, strips tags, resolves citations, and detects dense line tags', () => {
    const parsed = parseTranslationFile(`---
formatVersion: 1
work: nicomachean-ethics
translator: "J. A. Smith"
license: public-domain
year: 1911
source: "Archive"
language: en
id: smith-ethics
---
Preface.
{1.1}Happiness {1094a}is an activity {2}of soul. {1094b}Another column.`);

    expect(parsed.meta).toMatchObject({
      work: 'nicomachean-ethics',
      translator: 'J. A. Smith',
      license: 'public-domain',
      year: 1911,
      source: 'Archive',
      language: 'en',
      id: 'smith-ethics',
    });
    expect(parsed.text).toBe('Preface.\nHappiness is an activity of soul. Another column.');
    expect(parsed.density).toBe('exhaustive');
    expect(parsed.tags.map(t => t.citation).filter(Boolean)).toEqual(['1094a1', '1094a2', '1094b1']);
  });

  it('fails restrictive on malformed metadata and warns on invalid citation order', () => {
    const parsed = parseTranslationFile(`---
license: commercial
year: not-a-year
---
{20}No column yet. {1094b}Later {10}line {5}backtrack. {1094a}column backtrack.`);

    expect(parsed.meta.license).toBe('user-supplied');
    expect(parsed.meta.year).toBeUndefined();
    expect(parsed.warnings).toEqual([
      'line tag {20} before any column tag — ignored (no column context)',
      'line {5} does not advance within 1094b (previous: 10)',
      'column {1094a} does not advance from {1094b} — check the source tags',
    ]);
  });

  it('serializes metadata and splits parsed text into chapter fixtures with local offsets', () => {
    const meta: TranslationMeta = {
      formatVersion: 1,
      work: 'ethics',
      translator: 'Smith',
      license: 'cc-by',
      year: 1900,
      source: 'He said "source"',
      language: 'en',
      id: slugId('Smith', 'Ethics'),
    };
    const frontmatter = serializeFrontmatter(meta);
    const split = splitChapters(parseTranslationFile('Intro. {1.1}Alpha {1094a}beta. {1.2}Gamma {1094b}delta.'));

    expect(frontmatter).toContain('source: "He said \'source\'"');
    expect(meta.id).toBe('smith-ethics');
    expect(columnKey('1094a')).toBeLessThan(columnKey('1094b'));
    expect(split.preamble).toBe('Intro.');
    expect(split.chapters).toEqual([
      expect.objectContaining({ book: 1, chapter: 1, text: 'Alpha beta.' }),
      expect.objectContaining({ book: 1, chapter: 2, text: 'Gamma delta.' }),
    ]);
    expect(split.chapters[0].tags[0]).toMatchObject({ citation: '1094a1', offset: 6 });
  });
});

describe('tagged-path chapter-key audit', () => {
  const audit = (
    raw: string,
    books = 3,
    options: Parameters<typeof auditChapterKeys>[2] = {},
  ) => {
    const parsed = parseTranslationFile(raw);
    return () => auditChapterKeys(parsed.tags, books, options);
  };

  it('rejects a duplicate key and names it', () => {
    expect(audit('{1.1} One.\n{1.2} Two.\n{1.2} Duplicate.'))
      .toThrow('Duplicate chapter key {1.2}');
  });

  it('rejects a backward key and names it', () => {
    expect(audit('{1.1} One.\n{1.3} Three.\n{1.2} Two.'))
      .toThrow('Backward chapter key {1.2}');
  });

  it('rejects a restarted sequence and names the offending key', () => {
    expect(audit('{1.1} One.\n{1.3} Three.\n{1.1} Restart.'))
      .toThrow('Restarted chapter key {1.1}');
    expect(audit('{2.1} Later book.\n{1.1} Restarted work.'))
      .toThrow('Restarted chapter key {1.1}');
  });

  it('rejects a book beyond the selected work range and names it', () => {
    expect(audit('{1.1} One.\n{4.1} Too far.', 3))
      .toThrow('Chapter key {4.1} is out of range');
  });

  it('quotes the printed book labels, not just the storage indices', () => {
    // The Eudemian Ethics stores five books printed I, II, III, VII, VIII —
    // "books 1–5" alone would send the reader hunting for a missing book IV.
    expect(audit('{6.1} Common book.', 5, { bookLabels: ['I', 'II', 'III', 'VII', 'VIII'] }))
      .toThrow('books 1–5, printed I/II/III/VII/VIII');
  });

  it('rejects a chapter beyond that book’s chapter count and names the key', () => {
    const chaptersPerBook = new Map([[1, 14], [2, 9]]);
    expect(audit('{1.1} One.\n{1.99} Nowhere.', 3, { chaptersPerBook }))
      .toThrow('Chapter key {1.99} is out of range: book 1 has 14 chapters.');
    expect(audit('{1.1} One.\n{1.14} Last chapter.', 3, { chaptersPerBook })).not.toThrow();
  });

  it('names the printed book when a chapter runs past its end', () => {
    expect(audit('{4.20} Past the end.', 5, {
      bookLabels: ['I', 'II', 'III', 'VII', 'VIII'],
      chaptersPerBook: new Map([[4, 12]]),
    })).toThrow('book 4 (printed VII) has 12 chapters.');
  });

  it('refuses a book the chapter index does not cover rather than skipping the check', () => {
    // Fail closed. The index is an authority over what it contains; its
    // silence about book 3 is not a verdict that {3.40} is a real chapter.
    expect(audit('{3.40} Uncharted book.', 3, { chaptersPerBook: new Map([[1, 14]]) }))
      .toThrow('Chapter key {3.40} cannot be checked');
    expect(audit('{1.99} Nowhere.', 3, { chaptersPerBook: new Map([[2, 9]]) }))
      .toThrow('has no entry for book 1');
  });

  it('checks no chapter bound at all when no index was supplied', () => {
    expect(audit('{1.99} Nowhere.', 3)).not.toThrow();
  });
});
