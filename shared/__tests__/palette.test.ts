import { describe, expect, it } from 'vitest';
import { citationTargets, hasGreek, parseCitation, rankLemmata, rankWorks } from '../lib/palette';
import type { BekkerRef, LemmaRef } from '../lib/data';

describe('parseCitation', () => {
  it('parses a full citation', () => {
    expect(parseCitation('1103a14')).toEqual({ column: '1103a', line: 14 });
  });
  it('parses a bare column', () => {
    expect(parseCitation('1103A')).toEqual({ column: '1103a', line: null });
  });
  it('tolerates spaces and a dot separator', () => {
    expect(parseCitation(' 1094 a.1 ')).toEqual({ column: '1094a', line: 1 });
  });
  it('parses the short columns of the Organon', () => {
    // Categories runs 1a–15b, De Interpretatione 16a–24b: one- and two-digit
    // columns are citations too, not stray numbers.
    expect(parseCitation('8b20')).toEqual({ column: '8b', line: 20 });
    expect(parseCitation('16a3')).toEqual({ column: '16a', line: 3 });
  });
  it('rejects prose and work names', () => {
    expect(parseCitation('ethics')).toBeNull();
    expect(parseCitation('12c4')).toBeNull();
    expect(parseCitation('')).toBeNull();
  });
});

describe('citationTargets', () => {
  const index: Record<string, BekkerRef[]> = {
    '1103a': [{ work: 'EN', book: 2, lo: 1, hi: 34 }],
    // Posterior Analytics ends inside 100b, where the Topics begins.
    '100b': [
      { work: 'APo', book: 2, lo: 1, hi: 17 },
      { work: 'Top', book: 1, lo: 18, hi: 43 },
    ],
    // The Isagoge is paginated by Busse, not Bekker — its "1a" is a different
    // page from the Categories' 1a and must never be offered as a jump.
    '1a': [
      { work: 'Cat', book: 1, lo: 1, hi: 25 },
      { work: 'Isa', book: 1, lo: 1, hi: 22 },
    ],
  };

  it('finds the work that owns a citation from anywhere in the site', () => {
    expect(citationTargets(index, '1103a', 14, null)).toEqual([{ work: 'EN', book: 2 }]);
  });
  it('picks the book whose line range holds the citation', () => {
    expect(citationTargets(index, '100b', 5, null)[0]).toEqual({ work: 'APo', book: 2 });
    expect(citationTargets(index, '100b', 30, null)[0]).toEqual({ work: 'Top', book: 1 });
  });
  it('puts the work being read first when it owns the column', () => {
    expect(citationTargets(index, '100b', 5, 'Top')[0]).toEqual({ work: 'Top', book: 1 });
  });
  it('drops works that are not cited by Bekker', () => {
    expect(citationTargets(index, '1a', 5, null)).toEqual([{ work: 'Cat', book: 1 }]);
  });
  it('returns nothing for a column no work carries', () => {
    expect(citationTargets(index, '9999a', 1, null)).toEqual([]);
  });
});

describe('hasGreek', () => {
  it('detects polytonic and monotonic Greek', () => {
    expect(hasGreek('λόγος')).toBe(true);
    expect(hasGreek('ἀρετή')).toBe(true);
    expect(hasGreek('virtue')).toBe(false);
    expect(hasGreek('1103a14')).toBe(false);
  });
});

describe('rankWorks', () => {
  it('ranks exact abbreviation above title substring', () => {
    const r = rankWorks('EN');
    expect(r[0]?.id).toBe('EN');
  });
  it('matches a word inside the title', () => {
    const r = rankWorks('ethics');
    expect(r.some((w) => w.id === 'EN')).toBe(true);
  });
  it('returns nothing for an empty query', () => {
    expect(rankWorks('  ')).toEqual([]);
  });
  it('caps the result count', () => {
    expect(rankWorks('a', undefined, 3).length).toBeLessThanOrEqual(3);
  });
});

describe('rankLemmata', () => {
  const lemmata: Record<string, LemmaRef> = {
    'lo/gos': { slug: 'logos', head: 'λόγος', count: 100 },
    'le/gw': { slug: 'lego', head: 'λέγω', count: 500 },
    'lu/w': { slug: 'luo', head: 'λύω', count: 5 },
    'a)reth/': { slug: 'arete', head: 'ἀρετή', count: 300 },
  };
  it('prefix-matches on the folded headword, frequency-ranked', () => {
    const r = rankLemmata('λ', lemmata);
    expect(r.map((x) => x.slug)).toEqual(['lego', 'logos', 'luo']);
  });
  it('accent-insensitive matching', () => {
    expect(rankLemmata('λογο', lemmata).map((x) => x.slug)).toEqual(['logos']);
  });
  it('respects the limit', () => {
    expect(rankLemmata('λ', lemmata, 1).map((x) => x.slug)).toEqual(['lego']);
  });
  it('empty for non-matching input', () => {
    expect(rankLemmata('ζζζ', lemmata)).toEqual([]);
  });
});
