import { describe, expect, it } from 'vitest';
import { splitPages } from '../pages';

describe('splitPages', () => {
  it('returns a single page when there is no form feed', () => {
    const pages = splitPages('line one\nline two\nline three');
    expect(pages).toHaveLength(1);
    expect(pages[0].index).toBe(0);
    expect(pages[0].lines).toEqual(['line one', 'line two', 'line three']);
  });

  it('splits multiple pages on \\f', () => {
    const pages = splitPages('page one\nstill page one\fpage two\nstill page two');
    expect(pages).toHaveLength(2);
    expect(pages[0].lines).toEqual(['page one', 'still page one']);
    expect(pages[1].lines).toEqual(['page two', 'still page two']);
  });

  it('yields an empty page for a doubled form feed', () => {
    const pages = splitPages('page one\f\fpage two');
    expect(pages).toHaveLength(3);
    expect(pages[1].lines).toEqual(['']);
  });

  it('strips trailing \\r from CRLF lines', () => {
    const pages = splitPages('line one\r\nline two\r\n');
    expect(pages[0].lines).toEqual(['line one', 'line two', '']);
  });

  it('assigns correct 0-based index ordinals across pages', () => {
    const pages = splitPages('a\fb\fc\fd');
    expect(pages.map((p) => p.index)).toEqual([0, 1, 2, 3]);
  });
});
