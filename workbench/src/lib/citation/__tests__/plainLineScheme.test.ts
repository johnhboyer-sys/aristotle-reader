// plain-line — D8 document-spine scheme (bare-integer addresses). See
// workbench-design/d8-view-modes.md §1.
import { describe, expect, it } from 'vitest';
import type { RefSpan, WorkMeta } from '../types';
import { plainLineScheme } from '../schemes/plainLineScheme';
import { getScheme } from '../registry';

const freeDoc: WorkMeta = {
  id: 'free-doc-2',
  title: 'Some Imported Poem',
  author: 'Unknown',
  scheme: 'plain-line',
  books: [], // bookless work — see bookLabel discussion in the scheme file
};

describe('plainLineScheme.parseAddress', () => {
  const valid = ['1', '3', '100'];

  for (const raw of valid) {
    it(`parses "${raw}"`, () => {
      const addr = plainLineScheme.parseAddress(raw);
      expect(addr).toEqual({ scheme: 'plain-line', raw });
      // Round-trip: comparing it against itself is always 0.
      expect(plainLineScheme.compareAddress(addr, addr)).toBe(0);
    });
  }

  const malformed = [
    'bogus',
    '1041a6',  // Bekker shape, not plain-line
    '¶1',      // paragraph shape, not plain-line
    '0',       // must be positive
    '-1',      // negative
    '1.5',     // not an integer
    ' 1',      // leading whitespace
    '1 ',      // trailing whitespace
    '1a',      // trailing garbage
    '1,2',     // not a single integer
    '',
  ];

  for (const raw of malformed) {
    it(`throws on malformed input ${JSON.stringify(raw)}`, () => {
      expect(() => plainLineScheme.parseAddress(raw)).toThrow();
    });
  }

  it('throw messages are plain (not a leaked internal struct)', () => {
    expect(() => plainLineScheme.parseAddress('bogus')).toThrow(/plain-line address/);
  });
});

describe('plainLineScheme.compareAddress', () => {
  const a = (raw: string) => plainLineScheme.parseAddress(raw);

  it('orders numerically', () => {
    expect(plainLineScheme.compareAddress(a('2'), a('10'))).toBeLessThan(0);
  });

  it('equal addresses compare to 0', () => {
    expect(plainLineScheme.compareAddress(a('5'), a('5'))).toBe(0);
  });

  it('is antisymmetric', () => {
    const x = a('3');
    const y = a('9');
    expect(Math.sign(plainLineScheme.compareAddress(x, y))).toBe(
      -Math.sign(plainLineScheme.compareAddress(y, x)),
    );
  });
});

describe('plainLineScheme.bookLabel', () => {
  it('returns the empty string for a bookless work (no manifest entry)', () => {
    expect(plainLineScheme.bookLabel(1, freeDoc)).toBe('');
  });
});

describe('plainLineScheme.formatRange', () => {
  const span = (start: string, end: string): RefSpan => ({
    scheme: 'plain-line',
    start: plainLineScheme.parseAddress(start),
    end: plainLineScheme.parseAddress(end),
  });

  it('point reference', () => {
    expect(plainLineScheme.formatRange(span('5', '5'))).toBe('5');
  });

  it('collapses a range: "3–7"', () => {
    expect(plainLineScheme.formatRange(span('3', '7'))).toBe('3–7');
  });

  it('uses the real en dash character U+2013, never a hyphen', () => {
    expect(plainLineScheme.formatRange(span('3', '7'))).toContain('–');
    expect(plainLineScheme.formatRange(span('3', '7'))).not.toContain('-');
  });
});

describe('plainLineScheme.formatCitation', () => {
  it('renders "*Title* 3–7" style, no book component', () => {
    const span: RefSpan = {
      scheme: 'plain-line',
      start: plainLineScheme.parseAddress('3'),
      end: plainLineScheme.parseAddress('7'),
    };
    expect(plainLineScheme.formatCitation(span, freeDoc)).toBe('*Some Imported Poem* 3–7');
  });

  it('point reference citation', () => {
    const span: RefSpan = {
      scheme: 'plain-line',
      start: plainLineScheme.parseAddress('12'),
      end: plainLineScheme.parseAddress('12'),
    };
    expect(plainLineScheme.formatCitation(span, freeDoc)).toBe('*Some Imported Poem* 12');
  });
});

describe('plainLineScheme.gutter / spineSource', () => {
  it('is structural-mode with a plain-line rowUnit', () => {
    expect(plainLineScheme.gutter).toEqual({ rowUnit: 'plain-line', gutterMode: 'structural' });
  });

  it('is document-spined, not corpus-spined', () => {
    expect(plainLineScheme.spineSource).toBe('document');
  });
});

describe('registry', () => {
  it('getScheme resolves plain-line', () => {
    expect(getScheme('plain-line')).toBe(plainLineScheme);
  });
});
