import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lastRead, resumeFor, touchRecent } from '../lib/resume';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('touchRecent', () => {
  it('records the work with a timestamp', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    touchRecent('EN');
    expect(JSON.parse(localStorage.getItem('reader-recent')!)).toEqual({ EN: 1000 });
  });

  it('keeps the most recent works and evicts beyond the cap', () => {
    for (let i = 0; i < 60; i++) {
      vi.spyOn(Date, 'now').mockReturnValue(i);
      touchRecent(`W${i}`);
    }
    const map = JSON.parse(localStorage.getItem('reader-recent')!);
    expect(Object.keys(map)).toHaveLength(50);
    expect(map.W59).toBe(59);
    expect(map.W9).toBeUndefined(); // oldest evicted
  });

  it('survives a corrupted stored value', () => {
    localStorage.setItem('reader-recent', 'not json');
    expect(() => touchRecent('EN')).not.toThrow();
    expect(JSON.parse(localStorage.getItem('reader-recent')!).EN).toBeTypeOf('number');
  });
});

describe('resumeFor', () => {
  it('joins the book and citation keys', () => {
    localStorage.setItem('reader-book-EN', '2');
    localStorage.setItem('reader-loc-EN', '1103a14');
    expect(resumeFor('EN')).toEqual({ book: 2, cite: '1103a14' });
  });

  it('defaults the book to 1 when only a citation is saved', () => {
    localStorage.setItem('reader-loc-DA', '412a3');
    expect(resumeFor('DA')).toEqual({ book: 1, cite: '412a3' });
  });

  it('returns null when nothing is saved', () => {
    expect(resumeFor('Meta')).toBeNull();
  });

  it('tolerates a garbage book value', () => {
    localStorage.setItem('reader-book-EN', 'lambda');
    expect(resumeFor('EN')).toEqual({ book: 1, cite: null });
  });
});

describe('lastRead', () => {
  it('returns the most recently touched work with its position', () => {
    localStorage.setItem('reader-book-EN', '2');
    localStorage.setItem('reader-loc-EN', '1103a14');
    localStorage.setItem('reader-book-DA', '1');
    vi.spyOn(Date, 'now').mockReturnValue(100);
    touchRecent('EN');
    vi.spyOn(Date, 'now').mockReturnValue(200);
    touchRecent('DA');
    expect(lastRead()).toEqual({ work: 'DA', book: 1, cite: null, at: 200 });
  });

  it('skips works the caller cannot resolve', () => {
    localStorage.setItem('reader-book-Zzz', '3');
    localStorage.setItem('reader-book-EN', '2');
    vi.spyOn(Date, 'now').mockReturnValue(100);
    touchRecent('EN');
    vi.spyOn(Date, 'now').mockReturnValue(200);
    touchRecent('Zzz');
    expect(lastRead((w) => w === 'EN')?.work).toBe('EN');
  });

  it('skips recency entries with no saved position', () => {
    localStorage.setItem('reader-book-EN', '2');
    vi.spyOn(Date, 'now').mockReturnValue(100);
    touchRecent('EN');
    vi.spyOn(Date, 'now').mockReturnValue(200);
    touchRecent('Ghost'); // recent but no book/loc keys
    expect(lastRead()?.work).toBe('EN');
  });

  it('returns null on an empty store', () => {
    expect(lastRead()).toBeNull();
  });
});
