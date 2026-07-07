import { describe, expect, it } from 'vitest';
import {
  createManifest,
  deriveSlug,
  parseManifest,
  referenceChapterFileName,
  removeChapter,
  serializeManifest,
  slugify,
  upsertChapter,
} from '../manifest';
import type { ReferenceManifest } from '../types';

describe('referenceChapterFileName', () => {
  it('zero-pads book and chapter', () => {
    expect(referenceChapterFileName(7, 17)).toBe('chapter-07-17.md');
    expect(referenceChapterFileName(1, 1)).toBe('chapter-01-01.md');
  });
});

describe('manifest round-trip', () => {
  it('serialize then parse yields an equivalent manifest', () => {
    const manifest = createManifest('metaphysics', 'ross', 'Ross (Oxford, 1924)', '2026-07-03T00:00:00.000Z');
    const withChapter = upsertChapter(
      manifest,
      { book: 7, chapter: 17, file: 'chapter-07-17.md' },
      '2026-07-03T01:00:00.000Z',
    );
    const raw = serializeManifest(withChapter);
    const parsed = parseManifest(raw);
    expect(parsed).toEqual(withChapter);
  });

  it('parseManifest returns null for corrupt JSON', () => {
    expect(parseManifest('{not json')).toBeNull();
  });

  it('parseManifest returns null for wrong shape', () => {
    expect(parseManifest(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
    expect(parseManifest(JSON.stringify({ foo: 'bar' }))).toBeNull();
    expect(parseManifest('null')).toBeNull();
    expect(parseManifest('42')).toBeNull();
  });

  it('parseManifest returns null when a chapter entry is malformed', () => {
    const bad = {
      schemaVersion: 1,
      workId: 'metaphysics',
      slug: 'ross',
      displayName: 'Ross',
      importedAt: '2026-07-03T00:00:00.000Z',
      chapters: [{ book: 'seven', chapter: 17, file: 'chapter-07-17.md' }],
    };
    expect(parseManifest(JSON.stringify(bad))).toBeNull();
  });

  it('parseManifest rejects an unknown schemaVersion', () => {
    const bad = {
      schemaVersion: 2,
      workId: 'metaphysics',
      slug: 'ross',
      displayName: 'Ross',
      importedAt: '2026-07-03T00:00:00.000Z',
      chapters: [],
    };
    expect(parseManifest(JSON.stringify(bad))).toBeNull();
  });
});

describe('slugify', () => {
  it('kebab-cases a display name', () => {
    expect(slugify('Ross (Oxford, 1924)')).toBe('ross-oxford-1924');
  });

  it('strips diacritics', () => {
    expect(slugify('Bekker Übersetzung')).toBe('bekker-ubersetzung');
  });

  it('falls back to "edition" for an empty/unsluggable name', () => {
    expect(slugify('   ')).toBe('edition');
    expect(slugify('!!!')).toBe('edition');
  });
});

describe('deriveSlug collision guard', () => {
  it('returns the plain slug when there is no collision', () => {
    expect(deriveSlug('Ross', [])).toBe('ross');
    expect(deriveSlug('Ross', ['bostock'])).toBe('ross');
  });

  it('appends -2, -3, ... on collision', () => {
    expect(deriveSlug('Ross', ['ross'])).toBe('ross-2');
    expect(deriveSlug('Ross', ['ross', 'ross-2'])).toBe('ross-3');
  });
});

describe('upsertChapter / removeChapter', () => {
  const base: ReferenceManifest = createManifest(
    'metaphysics',
    'ross',
    'Ross',
    '2026-07-03T00:00:00.000Z',
  );

  it('inserts a new chapter and sorts by (book, chapter)', () => {
    let m = upsertChapter(base, { book: 7, chapter: 17, file: 'chapter-07-17.md' }, 't1');
    m = upsertChapter(m, { book: 1, chapter: 1, file: 'chapter-01-01.md' }, 't2');
    expect(m.chapters.map((c) => `${c.book}.${c.chapter}`)).toEqual(['1.1', '7.17']);
    expect(m.importedAt).toBe('t2');
  });

  it('replaces an existing (book, chapter) entry rather than duplicating', () => {
    let m = upsertChapter(base, { book: 7, chapter: 17, file: 'chapter-07-17.md' }, 't1');
    m = upsertChapter(m, { book: 7, chapter: 17, file: 'chapter-07-17.md' }, 't2');
    expect(m.chapters).toHaveLength(1);
    expect(m.importedAt).toBe('t2');
  });

  it('does not mutate the input manifest', () => {
    const before = JSON.stringify(base);
    upsertChapter(base, { book: 7, chapter: 17, file: 'chapter-07-17.md' }, 't1');
    expect(JSON.stringify(base)).toBe(before);
  });

  it('removeChapter drops the matching entry only', () => {
    let m = upsertChapter(base, { book: 7, chapter: 17, file: 'chapter-07-17.md' }, 't1');
    m = upsertChapter(m, { book: 7, chapter: 18, file: 'chapter-07-18.md' }, 't2');
    m = removeChapter(m, 7, 17, 't3');
    expect(m.chapters).toHaveLength(1);
    expect(m.chapters[0].chapter).toBe(18);
  });

  it('removeChapter is a no-op for an absent entry', () => {
    const m = removeChapter(base, 9, 9, 't1');
    expect(m.chapters).toEqual(base.chapters);
  });
});
