import { describe, expect, it } from 'vitest';
import { citationTarget, citationTargets, hasGreek, parseCitation, parseSectionCitation, rankLemmata, rankWorks, sectionTarget } from '../lib/palette';
import type { BekkerRef, LemmaRef } from '../lib/data';
import { WORKS, type Work } from '../lib/works';

describe('parseCitation', () => {
  it('parses a full citation', () => {
    expect(parseCitation('1103a14')).toEqual({ column: '1103a', line: 14 });
  });
  it('parses a bare column', () => {
    expect(parseCitation('1103A')).toEqual({ column: '1103a', line: null });
  });
  it('tolerates spaces and a dot separator', () => {
    expect(parseCitation(' 1094 a.1 ')).toEqual({ column: '1094a', line: 1 });
    // A bare column with the dot but no line, as the old regex's `\.?` allowed.
    expect(parseCitation('1094a.')).toEqual({ column: '1094a', line: null });
    expect(parseCitation(' 1094 A. ')).toEqual({ column: '1094a', line: null });
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
  it('parses a lettered line and keeps a bare column', () => {
    expect(parseCitation('775a11a')).toEqual({ column: '775a', line: 11, sub: 'a' });
    expect(parseCitation('1103a')).toEqual({ column: '1103a', line: null });
  });
});

describe('citationTarget', () => {
  it('puts the letter in the loc a jump lands on', () => {
    expect(citationTarget(parseCitation('775a11a')!)).toEqual({
      label: 'Go to 775a11a',
      loc: '775a:11a',
    });
    expect(citationTarget(parseCitation('1103a14')!)).toEqual({
      label: 'Go to 1103a14',
      loc: '1103a:14',
    });
    expect(citationTarget(parseCitation('1103a')!)).toEqual({
      label: 'Go to 1103a',
      hash: '1103a',
    });
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

// The Athenian Constitution is cited by chapter.section. The registry entry
// lands with its data, so these tests carry their own fixture beside the real
// works rather than touching WORKS.
const ATHPOL: Work = {
  id: 'AthPol', title: 'Athenian Constitution', abbr: 'Ath. Pol.', author: 'Aristotle',
  books: 1, bookLabels: ['I'], greekEdition: 'Oppermann',
  greekSource: { short: 'Oppermann', full: 'Oppermann (Teubner, 1928)' },
  translations: [{ id: 'kenyon', name: 'F. G. Kenyon (Oxford, 1920)', short: 'Kenyon', slot: 'english' }],
  blurb: '', citation: { scheme: 'chapter-section' },
};
const WITH_ATHPOL = [...WORKS, ATHPOL];

describe('parseSectionCitation', () => {
  it('reads a work prefix by abbreviation or id, dots and spaces ignored', () => {
    const at = { work: 'AthPol', column: '56a', section: 6 };
    expect(parseSectionCitation('Ath. Pol. 56.6', null, WITH_ATHPOL)).toEqual(at);
    expect(parseSectionCitation('athpol 56.6', null, WITH_ATHPOL)).toEqual(at);
    expect(parseSectionCitation('  ATH.POL.56.6 ', 'EN', WITH_ATHPOL)).toEqual(at);
    expect(parseSectionCitation('AthPol 56 . 6', null, WITH_ATHPOL)).toEqual(at);
  });
  it('reads a bare chapter after a prefix', () => {
    expect(parseSectionCitation('Ath.Pol. 56', null, WITH_ATHPOL))
      .toEqual({ work: 'AthPol', column: '56a', section: null });
  });
  it('reads a bare chapter.section inside a chapter-section work only', () => {
    expect(parseSectionCitation('56.6', 'AthPol', WITH_ATHPOL))
      .toEqual({ work: 'AthPol', column: '56a', section: 6 });
    expect(parseSectionCitation('56.6', 'EN', WITH_ATHPOL)).toBeNull();
    expect(parseSectionCitation('56.6', 'Isa', WITH_ATHPOL)).toBeNull();
    expect(parseSectionCitation('56.6', null, WITH_ATHPOL)).toBeNull();
    // A bare number is not a citation, even in the work.
    expect(parseSectionCitation('56', 'AthPol', WITH_ATHPOL)).toBeNull();
  });
  it('refuses a prefix that names no chapter-section work', () => {
    expect(parseSectionCitation('Pol. 56.6', null, WITH_ATHPOL)).toBeNull();
    expect(parseSectionCitation('Isa 5.6', null, WITH_ATHPOL)).toBeNull();
    expect(parseSectionCitation('Foo 56.6', 'AthPol', WITH_ATHPOL)).toBeNull();
  });
  it('reads the real registry: AthPol carries the scheme', () => {
    expect(parseSectionCitation('Ath. Pol. 56.6', null, WORKS)).toEqual({ work: 'AthPol', column: '56a', section: 6 });
  });
  it('leaves every Bekker citation and work name to the other parsers', () => {
    for (const q of ['1103a14', '1103a', '8b20', '775a11a', 'ethics', 'Ath. Pol.', 'Ath. Pol. 56a3', '']) {
      expect(parseSectionCitation(q, 'AthPol', WITH_ATHPOL)).toBeNull();
    }
  });
});

describe('sectionTarget', () => {
  const index: Record<string, BekkerRef[]> = {
    '56a': [{ work: 'AthPol', book: 1, lo: 1, hi: 7 }],
    // A chapter number the Categories also uses as a Bekker column.
    '1a': [
      { work: 'Cat', book: 1, lo: 1, hi: 25 },
      { work: 'AthPol', book: 1, lo: 1, hi: 3 },
    ],
    '2a': [{ work: 'Cat', book: 1, lo: 1, hi: 39 }],
  };
  it('jumps to a section the work has', () => {
    expect(sectionTarget({ work: 'AthPol', column: '56a', section: 6 }, index))
      .toEqual({ book: 1, label: 'Go to 56.6', loc: '56a:6' });
    expect(sectionTarget({ work: 'AthPol', column: '1a', section: 3 }, index))
      .toEqual({ book: 1, label: 'Go to 1.3', loc: '1a:3' });
  });
  it('jumps to a bare chapter by hash', () => {
    expect(sectionTarget({ work: 'AthPol', column: '56a', section: null }, index))
      .toEqual({ book: 1, label: 'Go to 56', hash: '56a' });
  });
  it('offers no jump to a section out of range', () => {
    expect(sectionTarget({ work: 'AthPol', column: '56a', section: 8 }, index)).toBeNull();
    expect(sectionTarget({ work: 'AthPol', column: '56a', section: 0 }, index)).toBeNull();
    expect(sectionTarget({ work: 'AthPol', column: '1a', section: 4 }, index)).toBeNull();
  });
  it('offers no jump to a chapter only another work carries', () => {
    expect(sectionTarget({ work: 'AthPol', column: '2a', section: 1 }, index)).toBeNull();
    expect(sectionTarget({ work: 'AthPol', column: '70a', section: null }, index)).toBeNull();
  });
});

