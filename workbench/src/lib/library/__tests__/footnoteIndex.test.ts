// Work-wide continuous footnote numbering: the per-work count index and the
// preceding-chapters sum (build spec §3/§7 + task spec).
import { describe, expect, it } from 'vitest';
import {
  FOOTNOTE_INDEX_FILE,
  chapterKey,
  parseChapterKey,
  parseFootnoteIndex,
  serializeFootnoteIndex,
  precedingFootnoteCount,
  loadFootnoteIndex,
  updateFootnoteCount,
  onFootnoteIndexChange,
  emptyFootnoteIndex,
} from '../footnoteIndex';
import type { FootnoteIndexData } from '../footnoteIndex';
import { MemStorage } from './memStorage';

function index(counts: Record<string, number>): FootnoteIndexData {
  return { schemaVersion: 1, counts };
}

describe('chapter keys', () => {
  it('chapterKey is the zero-padded chapter-file stem', () => {
    expect(chapterKey(7, 17)).toBe('b07c17');
    expect(chapterKey(1, 1)).toBe('b01c01');
    expect(chapterKey(12, 3)).toBe('b12c03');
  });

  it('parseChapterKey round-trips and rejects junk', () => {
    expect(parseChapterKey('b07c17')).toEqual({ book: 7, chapter: 17 });
    expect(parseChapterKey('b7c2')).toEqual({ book: 7, chapter: 2 }); // hand-edited, un-padded
    expect(parseChapterKey('chapter7')).toBeNull();
    expect(parseChapterKey('b07c17.md')).toBeNull();
  });
});

describe('parse / serialize (regenerable cache — always tolerant)', () => {
  it('missing / corrupt / wrong-version files degrade to empty', () => {
    expect(parseFootnoteIndex(null)).toEqual(emptyFootnoteIndex());
    expect(parseFootnoteIndex('not json {')).toEqual(emptyFootnoteIndex());
    expect(parseFootnoteIndex('42')).toEqual(emptyFootnoteIndex());
    expect(parseFootnoteIndex('{"schema_version":2,"counts":{"b01c01":3}}')).toEqual(emptyFootnoteIndex());
  });

  it('drops malformed keys and non-integer counts, keeps good entries', () => {
    const parsed = parseFootnoteIndex(
      JSON.stringify({
        schema_version: 1,
        counts: { b01c01: 3, 'not-a-key': 9, b01c02: -1, b02c01: 2.5, b03c01: 4 },
      }),
    );
    expect(parsed.counts).toEqual({ b01c01: 3, b03c01: 4 });
  });

  it('round-trips through serialize (snake_case schema_version on disk)', () => {
    const data = index({ b07c17: 3, b01c02: 1 });
    const raw = serializeFootnoteIndex(data);
    expect(raw).toContain('"schema_version": 1');
    expect(parseFootnoteIndex(raw)).toEqual(data);
  });
});

describe('precedingFootnoteCount', () => {
  const books = [{ n: 1 }, { n: 2 }, { n: 3 }];
  const idx = index({ b01c01: 3, b01c02: 2, b02c01: 5 });

  it('first chapter of the work → 0 (its own entry never counts)', () => {
    expect(precedingFootnoteCount(idx, books, 1, 1)).toBe(0);
  });

  it('sums all preceding chapters within a book', () => {
    expect(precedingFootnoteCount(idx, books, 1, 2)).toBe(3);
    expect(precedingFootnoteCount(idx, books, 1, 3)).toBe(5);
  });

  it('sums across books; chapters missing from the index count 0', () => {
    expect(precedingFootnoteCount(idx, books, 2, 1)).toBe(5);
    expect(precedingFootnoteCount(idx, books, 2, 2)).toBe(10);
    expect(precedingFootnoteCount(idx, books, 2, 9)).toBe(10); // b02c02..08 missing → 0
    expect(precedingFootnoteCount(idx, books, 3, 1)).toBe(10);
  });

  it('respects MANIFEST book order, not numeric or file-name order', () => {
    // A manifest that orders book 14 before book 1: chapters of book 14
    // precede everything in book 1.
    const reordered = [{ n: 14 }, { n: 1 }];
    const i = index({ b14c01: 7, b01c01: 2 });
    expect(precedingFootnoteCount(i, reordered, 1, 1)).toBe(7);
    expect(precedingFootnoteCount(i, reordered, 14, 1)).toBe(0);
    expect(precedingFootnoteCount(i, reordered, 1, 2)).toBe(9);
  });

  it('falls back to numeric order (never string order) without a manifest', () => {
    // String order would put "b10..." before "b2..." — numeric must not.
    const i = index({ b2c1: 4, b10c1: 6 });
    expect(precedingFootnoteCount(i, null, 2, 2)).toBe(4); // book 10 does NOT precede book 2
    expect(precedingFootnoteCount(i, null, 10, 2)).toBe(10); // book 2 + b10c1
  });

  it('books unknown to the manifest sort after known ones, numerically', () => {
    const someBooks = [{ n: 2 }, { n: 1 }];
    const i = index({ b01c01: 1, b02c01: 2, b09c01: 4 });
    // book 9 is not in the manifest: everything known precedes it.
    expect(precedingFootnoteCount(i, someBooks, 9, 1)).toBe(3);
    // and unknown books never precede known ones.
    expect(precedingFootnoteCount(i, someBooks, 1, 1)).toBe(2); // book 2 listed first
  });
});

describe('updateFootnoteCount (the autosave ride-along)', () => {
  it('creates and updates the index file; no write when unchanged', async () => {
    const storage = new MemStorage();
    expect(await updateFootnoteCount(storage, 'meta', 7, 17, 3)).toBe(true);
    expect(storage.writes).toBe(1);
    expect(await loadFootnoteIndex(storage, 'meta')).toEqual(index({ b07c17: 3 }));

    // Same count again → no write, reports unchanged.
    expect(await updateFootnoteCount(storage, 'meta', 7, 17, 3)).toBe(false);
    expect(storage.writes).toBe(1);

    // Footnote removed → count drops.
    expect(await updateFootnoteCount(storage, 'meta', 7, 17, 2)).toBe(true);
    expect(await loadFootnoteIndex(storage, 'meta')).toEqual(index({ b07c17: 2 }));

    // Other chapters accumulate alongside.
    await updateFootnoteCount(storage, 'meta', 1, 2, 5);
    expect(await loadFootnoteIndex(storage, 'meta')).toEqual(index({ b01c02: 5, b07c17: 2 }));
  });

  it('count 0 removes the entry (absent means 0); 0 for a missing key is a no-op', async () => {
    const storage = new MemStorage();
    await updateFootnoteCount(storage, 'meta', 7, 17, 3);
    expect(await updateFootnoteCount(storage, 'meta', 7, 17, 0)).toBe(true);
    expect(await loadFootnoteIndex(storage, 'meta')).toEqual(emptyFootnoteIndex());
    expect(await updateFootnoteCount(storage, 'meta', 7, 17, 0)).toBe(false);
  });

  it('fires the in-process change event only on real changes', async () => {
    const storage = new MemStorage();
    const events: string[] = [];
    const unsub = onFootnoteIndexChange((workId) => events.push(workId));

    await updateFootnoteCount(storage, 'meta', 7, 17, 1);
    await updateFootnoteCount(storage, 'meta', 7, 17, 1); // unchanged → no event
    await updateFootnoteCount(storage, 'meta', 7, 17, 2);
    expect(events).toEqual(['meta', 'meta']);

    unsub();
    await updateFootnoteCount(storage, 'meta', 7, 17, 5);
    expect(events).toEqual(['meta', 'meta']);
  });

  it('survives a corrupt existing index file (treats it as empty)', async () => {
    const storage = new MemStorage();
    await storage.write('meta', FOOTNOTE_INDEX_FILE, '§ garbage');
    expect(await updateFootnoteCount(storage, 'meta', 7, 17, 3)).toBe(true);
    expect(await loadFootnoteIndex(storage, 'meta')).toEqual(index({ b07c17: 3 }));
  });
});
