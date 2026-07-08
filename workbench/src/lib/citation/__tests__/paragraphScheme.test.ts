// paragraph — D8 document-spine scheme (¶N addresses). See
// workbench-design/d8-view-modes.md §1.
import { describe, expect, it } from 'vitest';
import type { RefSpan, WorkMeta } from '../types';
import { paragraphScheme } from '../schemes/paragraphScheme';
import { getScheme } from '../registry';

const freeDoc: WorkMeta = {
  id: 'free-doc-1',
  title: 'Some Imported Text',
  author: 'Unknown',
  scheme: 'paragraph',
  books: [], // bookless work — see bookLabel discussion in the scheme file
};

describe('paragraphScheme.parseAddress', () => {
  const valid = ['¶1', '¶3', '¶100'];

  for (const raw of valid) {
    it(`parses "${raw}"`, () => {
      const addr = paragraphScheme.parseAddress(raw);
      expect(addr).toEqual({ scheme: 'paragraph', raw });
      // Round-trip: comparing it against itself is always 0.
      expect(paragraphScheme.compareAddress(addr, addr)).toBe(0);
    });
  }

  const malformed = [
    'bogus',
    '1041a6',  // Bekker shape, not paragraph
    '1',       // missing ¶ marker
    '¶',       // missing digits
    '¶0',      // must be positive
    '¶-1',     // negative
    '¶1.5',    // not an integer
    ' ¶1',     // leading whitespace
    '¶1 ',     // trailing whitespace
    '¶01a',    // trailing garbage
    '',
  ];

  for (const raw of malformed) {
    it(`throws on malformed input ${JSON.stringify(raw)}`, () => {
      expect(() => paragraphScheme.parseAddress(raw)).toThrow();
    });
  }

  it('throw messages are plain (not a leaked internal struct)', () => {
    expect(() => paragraphScheme.parseAddress('bogus')).toThrow(/paragraph address/);
  });
});

describe('paragraphScheme.compareAddress', () => {
  const a = (raw: string) => paragraphScheme.parseAddress(raw);

  it('orders numerically', () => {
    expect(paragraphScheme.compareAddress(a('¶2'), a('¶10'))).toBeLessThan(0);
  });

  it('equal addresses compare to 0', () => {
    expect(paragraphScheme.compareAddress(a('¶5'), a('¶5'))).toBe(0);
  });

  it('is antisymmetric', () => {
    const x = a('¶3');
    const y = a('¶9');
    expect(Math.sign(paragraphScheme.compareAddress(x, y))).toBe(
      -Math.sign(paragraphScheme.compareAddress(y, x)),
    );
  });
});

describe('paragraphScheme.bookLabel', () => {
  it('returns the empty string for a bookless work (no manifest entry)', () => {
    expect(paragraphScheme.bookLabel(1, freeDoc)).toBe('');
  });
});

describe('paragraphScheme.formatRange', () => {
  const span = (start: string, end: string): RefSpan => ({
    scheme: 'paragraph',
    start: paragraphScheme.parseAddress(start),
    end: paragraphScheme.parseAddress(end),
  });

  it('point reference', () => {
    expect(paragraphScheme.formatRange(span('¶5', '¶5'))).toBe('¶5');
  });

  it('collapses a range: "¶3–7"', () => {
    expect(paragraphScheme.formatRange(span('¶3', '¶7'))).toBe('¶3–7');
  });

  it('uses the real en dash character U+2013, never a hyphen', () => {
    expect(paragraphScheme.formatRange(span('¶3', '¶7'))).toContain('–');
    expect(paragraphScheme.formatRange(span('¶3', '¶7'))).not.toContain('-');
  });
});

describe('paragraphScheme.formatCitation', () => {
  it('renders "*Title* ¶3–7" style, no book component', () => {
    const span: RefSpan = {
      scheme: 'paragraph',
      start: paragraphScheme.parseAddress('¶3'),
      end: paragraphScheme.parseAddress('¶7'),
    };
    expect(paragraphScheme.formatCitation(span, freeDoc)).toBe('*Some Imported Text* ¶3–7');
  });

  it('point reference citation', () => {
    const span: RefSpan = {
      scheme: 'paragraph',
      start: paragraphScheme.parseAddress('¶12'),
      end: paragraphScheme.parseAddress('¶12'),
    };
    expect(paragraphScheme.formatCitation(span, freeDoc)).toBe('*Some Imported Text* ¶12');
  });
});

describe('paragraphScheme.gutter / spineSource', () => {
  it('is structural-mode with a paragraph rowUnit', () => {
    expect(paragraphScheme.gutter).toEqual({ rowUnit: 'paragraph', gutterMode: 'structural' });
  });

  it('is document-spined, not corpus-spined', () => {
    expect(paragraphScheme.spineSource).toBe('document');
  });
});

describe('registry', () => {
  it('getScheme resolves paragraph', () => {
    expect(getScheme('paragraph')).toBe(paragraphScheme);
  });
});
