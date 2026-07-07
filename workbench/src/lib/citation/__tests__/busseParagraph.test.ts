// busse-paragraph — Phase 2 exercise scheme (page.line, CAG-style, models
// the Isagoge citation on the reader site). See
// workbench-design/d2-citation-schemes.md, "Phase 2 exercise outcome".
import { describe, expect, it } from 'vitest';
import type { RefSpan, WorkMeta } from '../types';
import { busseParagraph } from '../schemes/busseParagraph';
import { getScheme } from '../registry';

const isagoge: WorkMeta = {
  id: 'isagoge',
  title: 'Isagoge',
  author: 'Porphyry',
  scheme: 'busse-paragraph',
  originalLanguage: 'greek',
  books: [], // bookless work — see bookLabel discussion in the scheme file
};

describe('busseParagraph.parseAddress', () => {
  const valid: [string, { page: number; line: number }][] = [
    ['1.5', { page: 1, line: 5 }],
    ['12.3', { page: 12, line: 3 }],
    ['100.1', { page: 100, line: 1 }],
  ];

  for (const [raw, expected] of valid) {
    it(`parses "${raw}"`, () => {
      const addr = busseParagraph.parseAddress(raw);
      expect(addr).toEqual({ scheme: 'busse-paragraph', raw });
      // Round-trip: comparing it against itself is always 0.
      expect(busseParagraph.compareAddress(addr, addr)).toBe(0);
      void expected;
    });
  }

  const malformed = [
    'bogus',
    '1041a6', // Bekker shape, not Busse
    '1',        // missing line
    '1.',       // missing line digits
    '.5',       // missing page digits
    '1.2.3',    // too many components
    '0.5',      // page must be positive
    '1.0',      // line must be positive
    '-1.5',     // negative page
    '1.-5',     // negative line
    ' 1.5',     // leading whitespace
    '1.5 ',     // trailing whitespace
    '1,5',      // wrong separator
    '',
  ];

  for (const raw of malformed) {
    it(`throws on malformed input ${JSON.stringify(raw)}`, () => {
      expect(() => busseParagraph.parseAddress(raw)).toThrow();
    });
  }

  it('throw messages are plain (not a leaked internal struct)', () => {
    expect(() => busseParagraph.parseAddress('bogus')).toThrow(/Busse address/);
  });
});

describe('busseParagraph.compareAddress', () => {
  const a = (raw: string) => busseParagraph.parseAddress(raw);

  it('orders by page first', () => {
    expect(busseParagraph.compareAddress(a('1.99'), a('2.1'))).toBeLessThan(0);
  });

  it('orders by line within the same page', () => {
    expect(busseParagraph.compareAddress(a('5.1'), a('5.2'))).toBeLessThan(0);
  });

  it('equal addresses compare to 0', () => {
    expect(busseParagraph.compareAddress(a('5.1'), a('5.1'))).toBe(0);
  });

  it('is antisymmetric', () => {
    const x = a('3.4');
    const y = a('3.9');
    expect(Math.sign(busseParagraph.compareAddress(x, y))).toBe(
      -Math.sign(busseParagraph.compareAddress(y, x)),
    );
  });
});

describe('busseParagraph.bookLabel', () => {
  it('returns the empty string for a bookless work (no manifest entry)', () => {
    expect(busseParagraph.bookLabel(1, isagoge)).toBe('');
  });

  it('reads a manifest label if a future busse-scheme work declares books', () => {
    const withBooks: WorkMeta = { ...isagoge, books: [{ n: 1, label: 'Prologue' }] };
    expect(busseParagraph.bookLabel(1, withBooks)).toBe('Prologue');
  });
});

describe('busseParagraph.formatRange', () => {
  const span = (start: string, end: string): RefSpan => ({
    scheme: 'busse-paragraph',
    start: busseParagraph.parseAddress(start),
    end: busseParagraph.parseAddress(end),
  });

  it('point reference', () => {
    expect(busseParagraph.formatRange(span('1.5', '1.5'))).toBe('1.5');
  });

  it('same-page collapse: "12.3–7"', () => {
    expect(busseParagraph.formatRange(span('12.3', '12.7'))).toBe('12.3–7');
  });

  it('cross-page: full ref both ends, "12.3–13.2"', () => {
    expect(busseParagraph.formatRange(span('12.3', '13.2'))).toBe('12.3–13.2');
  });

  it('uses the real en dash character U+2013, never a hyphen', () => {
    expect(busseParagraph.formatRange(span('12.3', '12.7'))).toContain('–');
    expect(busseParagraph.formatRange(span('12.3', '12.7'))).not.toContain('-');
  });
});

describe('busseParagraph.formatCitation', () => {
  it('renders "*Isagoge*, 1.5–2.3" style for a bookless work', () => {
    const span: RefSpan = {
      scheme: 'busse-paragraph',
      start: busseParagraph.parseAddress('1.5'),
      end: busseParagraph.parseAddress('2.3'),
    };
    expect(busseParagraph.formatCitation(span, isagoge)).toBe('*Isagoge*, 1.5–2.3');
  });

  it('point reference citation', () => {
    const span: RefSpan = {
      scheme: 'busse-paragraph',
      start: busseParagraph.parseAddress('12.3'),
      end: busseParagraph.parseAddress('12.3'),
    };
    expect(busseParagraph.formatCitation(span, isagoge)).toBe('*Isagoge*, 12.3');
  });

  it('omits an empty book label but keeps chapter if present (documented fallback)', () => {
    const span: RefSpan = {
      scheme: 'busse-paragraph',
      book: 1,
      chapter: 4,
      start: busseParagraph.parseAddress('12.3'),
      end: busseParagraph.parseAddress('12.3'),
    };
    // isagoge.books is [] so bookLabel(1, isagoge) === '' — falls back to
    // the bare chapter number rather than an empty-then-dot artifact.
    expect(busseParagraph.formatCitation(span, isagoge)).toBe('*Isagoge* 4, 12.3');
  });
});

describe('busseParagraph.gutter', () => {
  it('is address-mode with a paragraph rowUnit (not bekker-line)', () => {
    expect(busseParagraph.gutter).toEqual({ rowUnit: 'paragraph', gutterMode: 'address' });
  });
});

describe('registry', () => {
  it('getScheme resolves busse-paragraph', () => {
    expect(getScheme('busse-paragraph')).toBe(busseParagraph);
  });
});
