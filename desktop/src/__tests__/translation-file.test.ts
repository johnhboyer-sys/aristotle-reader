import { describe, expect, it } from 'vitest';
import {
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
