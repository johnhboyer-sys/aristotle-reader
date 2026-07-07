import { describe, expect, it } from 'vitest';
import type { RefSpan, WorkMeta } from '../types';
import { bekkerStandard, toRoman } from '../schemes/bekkerStandard';
import { bekkerMetaphysics } from '../schemes/bekkerMetaphysics';
import { aquinasStub } from '../schemes/aquinasStub';
import { getScheme, isKnownScheme } from '../registry';

const posteriorAnalytics: WorkMeta = {
  id: 'posterior-analytics',
  title: 'Posterior Analytics',
  author: 'Aristotle',
  scheme: 'bekker-standard',
  books: [
    { n: 1, label: 'I' },
    { n: 2, label: 'II' },
  ],
};

const metaphysics: WorkMeta = {
  id: 'metaphysics',
  title: 'Metaphysics',
  author: 'Aristotle',
  scheme: 'bekker-metaphysics',
  books: [
    { n: 1, label: 'Α' },
    { n: 2, label: 'α' },
    { n: 3, label: 'Β' },
    { n: 4, label: 'Γ' },
    { n: 5, label: 'Δ' },
    { n: 6, label: 'Ε' },
    { n: 7, label: 'Ζ' },
    { n: 8, label: 'Η' },
    { n: 9, label: 'Θ' },
    { n: 10, label: 'Ι' },
    { n: 11, label: 'Κ' },
    { n: 12, label: 'Λ' },
    { n: 13, label: 'Μ' },
    { n: 14, label: 'Ν' },
  ],
};

describe('toRoman', () => {
  it('converts small integers', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(2)).toBe('II');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(9)).toBe('IX');
    expect(toRoman(14)).toBe('XIV');
  });

  it('throws on non-positive input', () => {
    expect(() => toRoman(0)).toThrow();
    expect(() => toRoman(-1)).toThrow();
  });
});

describe('bekkerStandard', () => {
  it('bookLabel reads the manifest label', () => {
    expect(bekkerStandard.bookLabel(2, posteriorAnalytics)).toBe('II');
  });

  it('bookLabel falls back to Roman numerals when the manifest has no entry', () => {
    const bareWork: WorkMeta = { ...posteriorAnalytics, books: [] };
    expect(bekkerStandard.bookLabel(3, bareWork)).toBe('III');
  });

  it('renders the acceptance citation for Posterior Analytics II.19', () => {
    const span: RefSpan = {
      scheme: 'bekker-standard',
      book: 2,
      chapter: 19,
      start: bekkerStandard.parseAddress('100a3'),
      end: bekkerStandard.parseAddress('100b5'),
    };
    expect(bekkerStandard.formatCitation(span, posteriorAnalytics)).toBe(
      '*Posterior Analytics* II.19, 100a3–b5'
    );
  });

  it('parseAddress throws on malformed input', () => {
    expect(() => bekkerStandard.parseAddress('bogus')).toThrow();
  });

  it('compareAddress totally orders addresses, including 999b < 1000a', () => {
    const a = bekkerStandard.parseAddress('999b30');
    const b = bekkerStandard.parseAddress('1000a1');
    expect(bekkerStandard.compareAddress(a, b)).toBeLessThan(0);
  });

  it('gutter is address-mode, bekker-line rowUnit', () => {
    expect(bekkerStandard.gutter).toEqual({ rowUnit: 'bekker-line', gutterMode: 'address' });
  });
});

describe('bekkerMetaphysics', () => {
  it('is a spread of bekkerStandard with a different id', () => {
    expect(bekkerMetaphysics.id).toBe('bekker-metaphysics');
    expect(bekkerMetaphysics.gutter).toEqual(bekkerStandard.gutter);
  });

  it('bookLabel reads manifest labels, including lowercase Book II (α)', () => {
    expect(bekkerMetaphysics.bookLabel(1, metaphysics)).toBe('Α');
    expect(bekkerMetaphysics.bookLabel(2, metaphysics)).toBe('α');
    expect(bekkerMetaphysics.bookLabel(7, metaphysics)).toBe('Ζ');
  });

  it('renders the acceptance citation for Metaphysics Ζ.17', () => {
    const span: RefSpan = {
      scheme: 'bekker-metaphysics',
      book: 7,
      chapter: 17,
      start: bekkerMetaphysics.parseAddress('1041a6'),
      end: bekkerMetaphysics.parseAddress('1041b3'),
    };
    expect(bekkerMetaphysics.formatCitation(span, metaphysics)).toBe(
      '*Metaphysics* Ζ.17, 1041a6–b3'
    );
  });

  it('omits book/chapter parts when absent', () => {
    const span: RefSpan = {
      scheme: 'bekker-metaphysics',
      start: bekkerMetaphysics.parseAddress('1041a6'),
      end: bekkerMetaphysics.parseAddress('1041a6'),
    };
    expect(bekkerMetaphysics.formatCitation(span, metaphysics)).toBe('*Metaphysics*, 1041a6');
  });

  it('parseAddress tags the scheme as bekker-metaphysics', () => {
    expect(bekkerMetaphysics.parseAddress('1041a6').scheme).toBe('bekker-metaphysics');
  });
});

describe('aquinasStub', () => {
  it('is registered', () => {
    expect(getScheme('aquinas-tbd')).toBe(aquinasStub);
  });

  it('every behavioral method throws "Aquinas citation support is Phase 3"', () => {
    expect(() => aquinasStub.parseAddress('x')).toThrow('Aquinas citation support is Phase 3');
    expect(() => aquinasStub.compareAddress({} as never, {} as never)).toThrow(
      'Aquinas citation support is Phase 3'
    );
    expect(() => aquinasStub.bookLabel(1, metaphysics)).toThrow(
      'Aquinas citation support is Phase 3'
    );
    expect(() => aquinasStub.formatRange({} as never)).toThrow(
      'Aquinas citation support is Phase 3'
    );
    expect(() => aquinasStub.formatCitation({} as never, metaphysics)).toThrow(
      'Aquinas citation support is Phase 3'
    );
  });
});

describe('registry', () => {
  it('getScheme resolves all three registered schemes', () => {
    expect(getScheme('bekker-standard')).toBe(bekkerStandard);
    expect(getScheme('bekker-metaphysics')).toBe(bekkerMetaphysics);
    expect(getScheme('aquinas-tbd')).toBe(aquinasStub);
  });

  it('getScheme throws on an unknown id', () => {
    // @ts-expect-error deliberately invalid scheme id
    expect(() => getScheme('not-a-scheme')).toThrow(/unknown citation scheme/);
  });

  it('isKnownScheme narrows arbitrary strings', () => {
    expect(isKnownScheme('bekker-standard')).toBe(true);
    expect(isKnownScheme('nonsense')).toBe(false);
  });
});
