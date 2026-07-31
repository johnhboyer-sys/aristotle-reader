// source-ref carries a source's OWN citation strings, so its ordering rule is
// the whole scheme. These tests pin the cases that plain string comparison
// gets wrong, and the malformed input it must refuse rather than guess at.
import { describe, expect, it } from 'vitest';
import { sourceRefScheme, MAX_COMPONENTS } from '../schemes/sourceRefScheme';
import type { WorkMeta } from '../types';

const work: WorkMeta = {
  id: 'imported',
  title: 'De Rerum Natura',
  author: 'Lucretius',
  scheme: 'source-ref',
  books: [{ n: 1, label: 'Book I' }],
};

const addr = (raw: string) => sourceRefScheme.parseAddress(raw);
const cmp = (a: string, b: string) => sourceRefScheme.compareAddress(addr(a), addr(b));

describe('parseAddress', () => {
  it('accepts the citation shapes real sources declare', () => {
    for (const raw of ['1', '1.5', '379d', '2.3.11', 'praef.2', '1.pr.3', '980a21']) {
      expect(addr(raw)).toEqual({ scheme: 'source-ref', raw });
    }
  });

  it('keeps the raw string byte-for-byte', () => {
    // The address is the SOURCE's, not ours: no normalising, padding, or
    // case-folding, because it has to cite back to the printed edition.
    expect(addr('379D').raw).toBe('379D');
  });

  it('tolerates a trailing dot, which real sources print ("praef.")', () => {
    expect(addr('praef.').raw).toBe('praef.');
  });

  it('refuses an empty address', () => {
    expect(() => addr('')).toThrow(/non-empty/);
  });

  it('refuses whitespace rather than trimming it', () => {
    expect(() => addr('1. 5')).toThrow(/whitespace/);
  });

  it('refuses an empty interior component', () => {
    expect(() => addr('1..5')).toThrow(/empty component/);
  });

  it('refuses punctuation and symbols, so parser junk cannot pass as a citation', () => {
    expect(() => addr('!!!not-a-real-address!!!')).toThrow(/letters and digits/);
    expect(() => addr('1.5-9')).toThrow(/letters and digits/);
  });

  it('accepts a Greek book letter as a component', () => {
    expect(addr('Ζ.17').raw).toBe('Ζ.17');
  });

  it('refuses an absurdly deep address', () => {
    const tooDeep = Array.from({ length: MAX_COMPONENTS + 1 }, (_, i) => i + 1).join('.');
    expect(() => addr(tooDeep)).toThrow(/too many components/);
  });
});

describe('compareAddress', () => {
  it('compares digit runs as numbers, not text', () => {
    // The case that motivates the whole scheme: "10" < "9" as strings.
    expect(cmp('1.9', '1.10')).toBeLessThan(0);
    expect(cmp('2', '10')).toBeLessThan(0);
  });

  it('walks components left to right', () => {
    expect(cmp('1.99', '2.1')).toBeLessThan(0);
  });

  it('sorts a prefix before what extends it', () => {
    expect(cmp('1', '1.1')).toBeLessThan(0);
  });

  it('orders Stephanus-style letter suffixes', () => {
    expect(cmp('379a', '379d')).toBeLessThan(0);
    expect(cmp('379d', '380a')).toBeLessThan(0);
  });

  it('orders a bare number before the same number with a suffix', () => {
    expect(cmp('2', '2a')).toBeLessThan(0);
  });

  it('is a total order: reflexive, antisymmetric, transitive', () => {
    const raws = ['1', '1.1', '1.9', '1.10', '2', '2a', '379a', '379d'];
    for (const a of raws) expect(cmp(a, a)).toBe(0);
    for (const a of raws) {
      for (const b of raws) {
        // `+ 0` normalises -0 to 0; toBe uses Object.is, which tells them apart.
        expect(Math.sign(cmp(a, b))).toBe(-Math.sign(cmp(b, a)) + 0);
      }
    }
    const sorted = [...raws].sort((a, b) => cmp(a, b));
    expect(sorted).toEqual(['1', '1.1', '1.9', '1.10', '2', '2a', '379a', '379d']);
  });
});

describe('formatting', () => {
  it('renders a point reference as the bare address', () => {
    const a = addr('1.5');
    expect(sourceRefScheme.formatRange({ scheme: 'source-ref', start: a, end: a })).toBe('1.5');
  });

  it('renders a range with an en dash and does NOT collapse the shared tier', () => {
    // "1.5–9" would be ambiguous about which tier the 9 names.
    const span = { scheme: 'source-ref' as const, start: addr('1.5'), end: addr('1.9') };
    expect(sourceRefScheme.formatRange(span)).toBe('1.5–1.9');
  });

  it('cites with the work title', () => {
    const span = { scheme: 'source-ref' as const, start: addr('1.5'), end: addr('1.9') };
    expect(sourceRefScheme.formatCitation(span, work)).toBe('*De Rerum Natura* 1.5–1.9');
  });

  it('reads book labels from the manifest and is bookless when absent', () => {
    expect(sourceRefScheme.bookLabel(1, work)).toBe('Book I');
    expect(sourceRefScheme.bookLabel(2, work)).toBe('');
  });
});

describe('spine ownership', () => {
  it('is a document spine, so imported rows can be split and merged', () => {
    expect(sourceRefScheme.spineSource).toBe('document');
  });

  it('shows the source address in the gutter', () => {
    expect(sourceRefScheme.gutter.gutterMode).toBe('address');
  });
});
