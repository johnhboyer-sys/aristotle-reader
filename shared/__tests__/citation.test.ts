import { describe, expect, it, vi } from 'vitest';

// schemeFor reads works.ts' citation.scheme; a busse-scheme work is no longer
// in the real registry (Plato-only now), so a fixture meta stands in for one
// rather than depending on a real registry entry.
vi.mock('../lib/works', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/works')>();
  const metas: Record<string, { id: string; abbr: string; citation?: { scheme: string } }> = {
    EN: { id: 'EN', abbr: 'EN' }, // no citation field -> default bekker
    BusseWork: { id: 'BusseWork', abbr: 'Busse', citation: { scheme: 'busse' } },
  };
  return {
    ...actual,
    getWork: (id: string) => metas[id] ?? (actual.getWork(id) as unknown),
  };
});

import {
  formatCite,
  formatHash,
  formatLocValue,
  scheme,
  schemeFor,
} from '../lib/citation';

describe('per-scheme contract', () => {
  it('exposes the three scheme ids with the right line policy', () => {
    expect(scheme('bekker').id).toBe('bekker');
    expect(scheme('bekker').hasUserFacingLines).toBe(true);
    expect(scheme('busse').id).toBe('busse');
    expect(scheme('busse').hasUserFacingLines).toBe(true);
    expect(scheme('stephanus').id).toBe('stephanus');
    expect(scheme('stephanus').hasUserFacingLines).toBe(false);
  });

  it('defaults an unknown/omitted scheme id to bekker', () => {
    expect(scheme(undefined).id).toBe('bekker');
    expect(scheme(null).id).toBe('bekker');
    expect(scheme('not-a-scheme').id).toBe('bekker');
  });

  it('schemeFor reads works.ts citation.scheme and defaults to bekker', () => {
    expect(schemeFor('EN').id).toBe('bekker');       // no citation field -> default
    expect(schemeFor('BusseWork').id).toBe('busse');  // citation: { scheme: 'busse', ... }
    expect(schemeFor('NoSuchWork').id).toBe('bekker'); // unknown work -> default
  });
});

describe('parseColumnToken', () => {
  it.each([
    ['1097a', '1097a'],
    ['1097A', '1097a'],
    [' 1097a ', '1097a'],
    ['1097f', null],   // outside a-e
    ['1097a15', null], // a column token, not a ref (has a trailing line)
    ['abc', null],
  ])('bekker parses %s -> %s', (raw, expected) => {
    expect(scheme('bekker').parseColumnToken(raw)).toBe(expected);
  });

  it.each([
    ['34b', '34b'],
    ['34B', '34b'],
    ['34c', '34c'], // stephanus letters run a-e
    ['34e', '34e'],
    ['34f', null],
  ])('stephanus parses %s -> %s', (raw, expected) => {
    expect(scheme('stephanus').parseColumnToken(raw)).toBe(expected);
  });
});

describe('parseLocation', () => {
  describe('a scheme with user-facing lines (bekker)', () => {
    const s = scheme('bekker');
    it.each([
      ['1097a', { column: '1097a', line: null }],       // bare column
      ['1097a:15', { column: '1097a', line: 15 }],       // location-query grammar
      ['1097a15', { column: '1097a', line: 15 }],        // legacy concatenated citation
      ['1097a 15', { column: '1097a', line: 15 }],
      ['1097A.15', { column: '1097a', line: 15 }],
      ['1097c15', { column: '1097c', line: 15 }],        // widened a-e grammar
      ['not a citation', null],
      ['1097f15', null],
      ['', null],
    ])('%s -> %o', (raw, expected) => {
      expect(s.parseLocation(raw)).toEqual(expected);
    });
  });

  describe('a scheme with no user-facing lines (stephanus)', () => {
    const s = scheme('stephanus');
    it.each([
      ['17a', { column: '17a', line: null }],  // bare column: the only valid citation shape
      ['34b', { column: '34b', line: null }],
      ['34b12', null],   // a fixed KNOWN DEFECT case: reject, don't silently truncate
      ['34b:12', null],  // same rejection via the query-grammar's colon form
      ['not a citation', null],
    ])('%s -> %o', (raw, expected) => {
      expect(s.parseLocation(raw)).toEqual(expected);
    });
  });

  it('never returns a line of undefined/NaN for a column-only value (the L{col}-undefined bug)', () => {
    for (const id of ['bekker', 'busse', 'stephanus'] as const) {
      const parsed = scheme(id).parseLocation('17a');
      expect(parsed).not.toBeNull();
      expect(parsed!.line).toBeNull();
    }
  });
});

describe('formatCitation', () => {
  it('bekker/busse render column+line concatenated, or bare column with no line', () => {
    expect(scheme('bekker').formatCitation('1097a', 15)).toBe('1097a15');
    expect(scheme('bekker').formatCitation('1097a', null)).toBe('1097a');
    expect(scheme('bekker').formatCitation('1097a')).toBe('1097a');
  });

  it('stephanus always renders the bare section token, even if a line is passed', () => {
    expect(scheme('stephanus').formatCitation('17a')).toBe('17a');
    expect(scheme('stephanus').formatCitation('17a', 12)).toBe('17a');
  });
});

describe('work-level convenience composers', () => {
  it('formatCite/formatHash follow the work\'s scheme', () => {
    expect(formatCite('EN', '1097a', 15)).toBe('1097a15');
    expect(formatHash('EN', '1097a', 15)).toBe('#1097a15');
    expect(formatCite('BusseWork', '1a', 5)).toBe('1a5');
  });

  it('formatLocValue emits the colon form when a scheme has lines, else the bare column', () => {
    expect(formatLocValue('EN', '1097a', 15)).toBe('1097a:15');
    expect(formatLocValue('EN', '1097a', null)).toBe('1097a');
    expect(formatLocValue('EN', '1097a')).toBe('1097a');
  });
});
