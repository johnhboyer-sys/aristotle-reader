import { describe, expect, it } from 'vitest';
import {
  columnKey,
  columnRange,
  compareColumn,
  compareRef,
  lineKey,
  parseColumn,
  parseRef,
  refKey,
} from '../bekker';

describe('parseColumn', () => {
  it('parses a page+side string', () => {
    expect(parseColumn('1094a')).toEqual({ page: 1094, side: 'a' });
    expect(parseColumn('999b')).toEqual({ page: 999, side: 'b' });
  });

  it('throws on a ref (trailing line number)', () => {
    expect(() => parseColumn('1094a1')).toThrow(/not a Bekker column/);
  });

  it('throws on garbage', () => {
    expect(() => parseColumn('abc')).toThrow(/not a Bekker column/);
    expect(() => parseColumn('')).toThrow(/not a Bekker column/);
    expect(() => parseColumn('1094c')).toThrow(/not a Bekker column/);
  });
});

describe('parseRef', () => {
  it('parses a page+side+line string', () => {
    expect(parseRef('1103a14')).toEqual({ page: 1103, side: 'a', line: 14 });
  });

  it('throws on a bare column (no line number)', () => {
    expect(() => parseRef('1094a')).toThrow(/not a Bekker ref/);
  });

  it('throws on garbage', () => {
    expect(() => parseRef('abc')).toThrow(/not a Bekker ref/);
    expect(() => parseRef('1094c1')).toThrow(/not a Bekker ref/);
  });
});

describe('columnKey / refKey / lineKey', () => {
  it('produces (page, side) tuples', () => {
    expect(columnKey('1094a')).toEqual([1094, 'a']);
    expect(columnKey('999b')).toEqual([999, 'b']);
  });

  it('produces (page, side, line) tuples', () => {
    expect(refKey('1103a14')).toEqual([1103, 'a', 14]);
  });

  it('lineKey combines a column and an explicit line', () => {
    expect(lineKey('1094a', 5)).toEqual([1094, 'a', 5]);
  });
});

describe('compareColumn / compareRef total ordering', () => {
  // Table-driven: [a, b, expected sign] mirroring Python tuple-comparison semantics.
  const columnCases: [string, string, number][] = [
    ['1094a', '1094a', 0],
    ['1094a', '1094b', -1],
    ['1094b', '1094a', 1],
    ['999b', '1000a', -1], // the critical non-string-sortable case
    ['1000a', '999b', 1],
    ['1094b', '1095a', -1], // a→b→next page a transition
  ];

  it.each(columnCases)('compareColumn(%s, %s) has sign %i', (a, b, expected) => {
    const sign = Math.sign(compareColumn(parseColumn(a), parseColumn(b)));
    expect(sign).toBe(expected);
  });

  const refCases: [string, string, number][] = [
    ['1094a1', '1094a2', -1],
    ['1094a20', '1094a3', 1], // numeric, not lexicographic: 20 > 3
    ['1094a20', '1094b1', -1],
    ['999b30', '1000a1', -1],
    ['1103a14', '1103a14', 0],
  ];

  it.each(refCases)('compareRef(%s, %s) has sign %i', (a, b, expected) => {
    const sign = Math.sign(compareRef(parseRef(a), parseRef(b)));
    expect(sign).toBe(expected);
  });
});

describe('columnRange', () => {
  it('enumerates within a single page', () => {
    expect(columnRange('1094a', '1094b')).toEqual(['1094a', '1094b']);
  });

  it('enumerates a single column', () => {
    expect(columnRange('1094a', '1094a')).toEqual(['1094a']);
  });

  it('enumerates across pages and sides inclusive', () => {
    expect(columnRange('1094a', '1095b')).toEqual(['1094a', '1094b', '1095a', '1095b']);
  });

  it('enumerates across the 999→1000 boundary', () => {
    expect(columnRange('999b', '1000a')).toEqual(['999b', '1000a']);
  });

  it('starts mid-page on the b side', () => {
    expect(columnRange('1094b', '1096a')).toEqual(['1094b', '1095a', '1095b', '1096a']);
  });

  it('throws if either endpoint is malformed', () => {
    expect(() => columnRange('1094a1', '1095a')).toThrow();
    expect(() => columnRange('1094a', 'bogus')).toThrow();
  });
});
