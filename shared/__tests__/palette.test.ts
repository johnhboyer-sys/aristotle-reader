import { describe, expect, it } from 'vitest';
import { hasGreek, parseCitation, rankLemmata, rankWorks } from '../lib/palette';
import type { LemmaRef } from '../lib/data';

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
  it('rejects prose and work names', () => {
    expect(parseCitation('ethics')).toBeNull();
    expect(parseCitation('12c4')).toBeNull();
    expect(parseCitation('')).toBeNull();
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
