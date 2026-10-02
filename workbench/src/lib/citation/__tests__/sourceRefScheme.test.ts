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

  it('accepts one space between two words of a component, as the TLG prints it', () => {
    // Aristophanes' fragments in Diogenes' export (tlg0019): "t,ante 471.1",
    // "Dram Ab.t.1". Refusing the space refused the whole work.
    for (const raw of ['t,ante 471.1', 'Dram Ab.t.1', 't,ante 53.1']) {
      expect(addr(raw)).toEqual({ scheme: 'source-ref', raw });
    }
  });

  it('still refuses a space at either end of a component, two spaces, or any other whitespace', () => {
    for (const raw of [' 1', '1 ', '1. 5', '1 .5', 'Dram  Ab', 'a b c', 'Dram Ab Extra.1', 'Dram\tAb', 'Dram Ab', 'Dram\nAb']) {
      expect(() => addr(raw), JSON.stringify(raw)).toThrow(/whitespace/);
    }
  });

  it('sorts a spaced component by its runs like any other', () => {
    expect(cmp('t,ante 471.1', 't,ante 471.2')).toBeLessThan(0);
    // Number order, not text order: as text "471" would sort before "53".
    expect(cmp('t,ante 53.1', 't,ante 471.1')).toBeLessThan(0);
    expect(cmp('Dram Ab.t.1', 'Dram Ken.t.1')).toBeLessThan(0);
  });

  it('refuses an empty interior component', () => {
    expect(() => addr('1..5')).toThrow(/empty component/);
  });

  it('refuses punctuation and symbols, so parser junk cannot pass as a citation', () => {
    expect(() => addr('!!!not-a-real-address!!!')).toThrow(/letters and digits/);
    expect(() => addr('1.5:9')).toThrow(/letters and digits/);
    // "1.5-9" used to be here. Real TLG data prints paired line numbers that
    // way, so it is now accepted — see the paired-line-numbers tests below.
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

// From QA against a real TLG disc: 78 of Aristotle's 122,429 citations join two
// line numbers, and rejecting them lost the whole work — the Physics failed on
// 205a.25,29. All three spellings occur in Diogenes' output.
describe('line numbers the edition printed as a pair', () => {
  it('accepts a comma, a hyphen and a slash between runs', () => {
    for (const raw of ['205a.25,29', '184b.25-26', '110/111', '1a.8,9']) {
      expect(() => sourceRefScheme.parseAddress(raw)).not.toThrow();
    }
  });

  it('still sorts such a line by its first number', () => {
    const at = (raw: string) => sourceRefScheme.parseAddress(raw);
    expect(sourceRefScheme.compareAddress(at('205a.24'), at('205a.25,29'))).toBeLessThan(0);
    expect(sourceRefScheme.compareAddress(at('205a.25,29'), at('205a.26'))).toBeLessThan(0);
  });

  it('refuses a separator that leads, trails, or doubles', () => {
    // Widening the rule must not turn it into "anything goes".
    for (const raw of ['-25', '25-', '25--26', '25,,29', '.']) {
      expect(() => sourceRefScheme.parseAddress(raw)).toThrow();
    }
  });

  it('still refuses parser junk', () => {
    // The reason the rule exists at all: a CTS urn must never pass as a citation.
    expect(() => sourceRefScheme.parseAddress('urn:cts:greekLit:tlg0059')).toThrow();
  });
});

// From a survey of 205,227 citations (85 disc exports + a FREED sample,
// 2026-10-02): the TLG marks a line with one trailing sign, and refusing it
// lost the whole work — the Iliad on 18.605*, the Argonautica on 1250* and
// 542/45*, Theocritus on 26(?), Theophrastus on 40* and 61(59). Those four
// shapes, and only those, are accepted.
describe('a line number carrying the TLG’s trailing mark', () => {
  const at = (raw: string) => sourceRefScheme.parseAddress(raw);

  it('accepts a star, a query and a parenthesised number at the end', () => {
    for (const raw of ['18.605*', '542/45*', '26(?)', '4.61(59).1', '40*.1']) {
      expect(at(raw)).toEqual({ scheme: 'source-ref', raw });
    }
  });

  it('sorts a marked line after the plain line and before the next', () => {
    expect(sourceRefScheme.compareAddress(at('18.605'), at('18.605*'))).toBeLessThan(0);
    expect(sourceRefScheme.compareAddress(at('18.605*'), at('18.606'))).toBeLessThan(0);
    expect(sourceRefScheme.compareAddress(at('4.61'), at('4.61(59)'))).toBeLessThan(0);
    expect(sourceRefScheme.compareAddress(at('4.61(59)'), at('4.62'))).toBeLessThan(0);
  });

  it('refuses a mark anywhere but the end, or more than one', () => {
    for (const raw of ['*', '*605', '6*05', '605**', '605*(?)', '(59)', '61()', '61(59', '61(!)', '61(?)a', '25,*']) {
      expect(() => at(raw), raw).toThrow(/letters and digits/);
    }
  });

  it('refuses a mark on anything but a line number', () => {
    // Every surveyed mark sits on a number or a printed pair. A mark on a word
    // or a lettered address is parser junk ("note(1)"), not a citation.
    for (const raw of ['praef*', 'note(1)', 'a(?)', '61(ab)', '61(5a)', '379d*', 'a/b*']) {
      expect(() => at(raw), raw).toThrow(/letters and digits/);
    }
  });
});
