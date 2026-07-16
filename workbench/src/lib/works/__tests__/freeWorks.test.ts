import { describe, expect, it, vi } from 'vitest';
import { MemStorage } from '../../library/__tests__/memStorage';
import {
  FREE_WORKS_STORAGE_ID,
  freeWorkManifest,
  listFreeWorkRecords,
  listFreeWorks,
  registerFreeWork,
  sanitizeBooks,
  updateFreeWorkBooks,
  updateFreeWorkLevels,
  withAddedBook,
  withAddedChapter,
  withRenamedBook,
  withRenamedChapter,
} from '../freeWorks';
import type { FreeBook, FreeWorkRecord } from '../freeWorks';
import { DEFAULT_PROFILE } from '../profile';

const RECORD: FreeWorkRecord = { id: 'my-doc', title: 'My Doc', scheme: 'paragraph' };

describe('free-work registry (works.json in the library root)', () => {
  it('is empty when no registry file exists', async () => {
    expect(await listFreeWorkRecords(new MemStorage())).toEqual([]);
    expect(await listFreeWorks(new MemStorage())).toEqual([]);
  });

  it('register → list round-trips records (language kept verbatim)', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'German' }, storage);
    await registerFreeWork({ id: 'verse', title: 'Verse', scheme: 'plain-line' }, storage);
    expect(await listFreeWorkRecords(storage)).toEqual([
      { ...RECORD, language: 'German' },
      { id: 'verse', title: 'Verse', scheme: 'plain-line' },
    ]);
  });

  it('persists and reads back a work organization profile (levels)', async () => {
    const storage = new MemStorage();
    const levels = [
      { name: 'Part', navRole: 'book' as const, depth: 0 },
      { name: 'Question', navRole: 'chapter' as const, depth: 1 },
    ];
    await registerFreeWork({ ...RECORD, levels }, storage);
    expect((await listFreeWorkRecords(storage))[0].levels).toEqual(levels);
    // Malformed levels degrade to absent (→ default profile), never a failure.
    await storage.write(
      FREE_WORKS_STORAGE_ID,
      'works.json',
      JSON.stringify({ version: 1, works: [{ id: 'x', title: 'X', citation_scheme: 'paragraph', levels: 'junk' }] }),
    );
    expect((await listFreeWorkRecords(storage))[0].levels).toBeUndefined();
  });

  it('updateFreeWorkLevels replaces only the levels, keeping other fields', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'Latin' }, storage);
    const levels = [
      { name: 'Part', navRole: 'book' as const, depth: 0 },
      { name: 'Question', navRole: 'chapter' as const, depth: 1 },
      { name: 'Article', navRole: 'heading' as const, depth: 2 },
    ];
    await updateFreeWorkLevels('my-doc', levels, storage);
    const rec = (await listFreeWorkRecords(storage))[0];
    expect(rec).toEqual({ ...RECORD, language: 'Latin', levels });
  });

  it('updateFreeWorkLevels with no usable levels clears them (reverts to default)', async () => {
    const storage = new MemStorage();
    await registerFreeWork(
      { ...RECORD, levels: [{ name: 'Part', navRole: 'book', depth: 0 }] },
      storage,
    );
    await updateFreeWorkLevels('my-doc', [{ name: '  ', navRole: 'heading', depth: 0 }], storage);
    expect((await listFreeWorkRecords(storage))[0].levels).toBeUndefined();
  });

  it('updateFreeWorkLevels is a no-op for an unknown work id', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkLevels('nope', [{ name: 'X', navRole: 'book', depth: 0 }], storage);
    expect((await listFreeWorkRecords(storage))[0].levels).toBeUndefined();
  });

  it('stores the registry as works.json under the reserved root id', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    const raw = storage.files.get(`${FREE_WORKS_STORAGE_ID}/works.json`);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(1);
    expect(parsed.works).toEqual([{ id: 'my-doc', title: 'My Doc', citation_scheme: 'paragraph' }]);
  });

  it('re-registering the same id replaces the entry', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await registerFreeWork({ ...RECORD, title: 'Renamed' }, storage);
    expect(await listFreeWorkRecords(storage)).toEqual([{ ...RECORD, title: 'Renamed' }]);
  });

  it('skips invalid entries (bad shape, unknown scheme, corpus-spine scheme) quietly', async () => {
    const storage = new MemStorage();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await storage.write(
        FREE_WORKS_STORAGE_ID,
        'works.json',
        JSON.stringify({
          version: 1,
          works: [
            { id: 'ok', title: 'OK', citation_scheme: 'plain-line' },
            { id: 'no-title', citation_scheme: 'paragraph' },
            { id: 'bad-scheme', title: 'X', citation_scheme: 'not-a-scheme' },
            // A corpus-spine scheme has no business in the free registry.
            { id: 'corpus', title: 'X', citation_scheme: 'bekker-standard' },
            'not-an-object',
          ],
        }),
      );
      const records = await listFreeWorkRecords(storage);
      expect(records).toEqual([{ id: 'ok', title: 'OK', scheme: 'plain-line' }]);
    } finally {
      warn.mockRestore();
    }
  });

  it('treats unreadable JSON as an empty registry, never a hard failure', async () => {
    const storage = new MemStorage();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await storage.write(FREE_WORKS_STORAGE_ID, 'works.json', '{not json');
      expect(await listFreeWorkRecords(storage)).toEqual([]);
      await storage.write(FREE_WORKS_STORAGE_ID, 'works.json', JSON.stringify({ version: 1 }));
      expect(await listFreeWorkRecords(storage)).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it('first entry wins on a duplicated id', async () => {
    const storage = new MemStorage();
    await storage.write(
      FREE_WORKS_STORAGE_ID,
      'works.json',
      JSON.stringify({
        version: 1,
        works: [
          { id: 'dup', title: 'First', citation_scheme: 'paragraph' },
          { id: 'dup', title: 'Second', citation_scheme: 'paragraph' },
        ],
      }),
    );
    expect(await listFreeWorkRecords(storage)).toEqual([
      { id: 'dup', title: 'First', scheme: 'paragraph' },
    ]);
  });
});

describe('freeWorkManifest', () => {
  it('builds a bookless single-book manifest with an empty author', () => {
    expect(freeWorkManifest(RECORD)).toEqual({
      id: 'my-doc',
      title: 'My Doc',
      author: '',
      scheme: 'paragraph',
      books: [{ n: 1, label: '' }],
      profile: DEFAULT_PROFILE,
    });
  });

  it('surfaces the record levels as the manifest profile (custom over default)', () => {
    const levels = [
      { name: 'Part', navRole: 'book' as const, depth: 0 },
      { name: 'Question', navRole: 'chapter' as const, depth: 1 },
      { name: 'Article', navRole: 'heading' as const, depth: 2 },
    ];
    expect(freeWorkManifest({ ...RECORD, levels }).profile).toEqual({ levels });
  });

  it("maps language onto originalLanguage only when it's greek/latin", () => {
    expect(freeWorkManifest({ ...RECORD, language: 'Greek' }).originalLanguage).toBe('greek');
    expect(freeWorkManifest({ ...RECORD, language: 'latin' }).originalLanguage).toBe('latin');
    expect(freeWorkManifest({ ...RECORD, language: 'German' }).originalLanguage).toBeUndefined();
    expect(freeWorkManifest(RECORD).originalLanguage).toBeUndefined();
  });
});

describe('explicit Book/Chapter structure (D8 structure tools)', () => {
  const BOOKS: FreeBook[] = [
    { label: 'Prima Pars', chapters: [{ label: 'Question 2' }, { label: 'Question 3' }] },
    { label: 'Secunda Pars', chapters: [] },
  ];

  it('register → list round-trips the books structure', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, books: BOOKS }, storage);
    expect((await listFreeWorkRecords(storage))[0].books).toEqual(BOOKS);
  });

  it('serializes books into works.json only when non-empty', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, books: BOOKS }, storage);
    const parsed = JSON.parse(storage.files.get(`${FREE_WORKS_STORAGE_ID}/works.json`)!);
    expect(parsed.works[0].books).toEqual(BOOKS);
    // An empty books array is treated as absent (single-document shape).
    await registerFreeWork({ ...RECORD, books: [] }, storage);
    expect('books' in JSON.parse(storage.files.get(`${FREE_WORKS_STORAGE_ID}/works.json`)!).works[0]).toBe(false);
  });

  it('sanitizeBooks COERCES bad labels (positions are load-bearing) and drops non-objects', () => {
    expect(
      sanitizeBooks([
        { label: '  Prima Pars  ', chapters: [{ label: ' Q2 ' }, { label: 42 }] },
        'not-an-object',
        { chapters: [{}, 'nope'] },
      ]),
    ).toEqual([
      { label: 'Prima Pars', chapters: [{ label: 'Q2' }, { label: '' }] },
      { label: '', chapters: [{ label: '' }] },
    ]);
    expect(sanitizeBooks('junk')).toBeUndefined();
    expect(sanitizeBooks([])).toBeUndefined();
  });

  it('freeWorkManifest emits documentBooks and mirrors them onto books', () => {
    const m = freeWorkManifest({ ...RECORD, books: BOOKS });
    expect(m.books).toEqual([
      { n: 1, label: 'Prima Pars' },
      { n: 2, label: 'Secunda Pars' },
    ]);
    expect(m.documentBooks).toEqual([
      { n: 1, label: 'Prima Pars', chapters: [{ n: 1, label: 'Question 2' }, { n: 2, label: 'Question 3' }] },
      { n: 2, label: 'Secunda Pars', chapters: [] },
    ]);
  });

  it('freeWorkManifest keeps the legacy single-document shape when bookless', () => {
    const m = freeWorkManifest(RECORD);
    expect(m.books).toEqual([{ n: 1, label: '' }]);
    expect(m.documentBooks).toBeUndefined();
  });

  it('updateFreeWorkBooks replaces the structure, keeping other fields', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'Latin' }, storage);
    await updateFreeWorkBooks('my-doc', BOOKS, storage);
    expect(await listFreeWorkRecords(storage)).toEqual([{ ...RECORD, language: 'Latin', books: BOOKS }]);
  });

  it('updateFreeWorkBooks with an empty array clears the structure', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, books: BOOKS }, storage);
    await updateFreeWorkBooks('my-doc', [], storage);
    expect((await listFreeWorkRecords(storage))[0].books).toBeUndefined();
  });

  it('updateFreeWorkBooks is a no-op for an unknown work id', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkBooks('nope', BOOKS, storage);
    expect((await listFreeWorkRecords(storage))[0].books).toBeUndefined();
  });

  it('pure helpers append and rename without reordering positions', () => {
    // withAddedBook: first book can absorb the existing document as chapter 1.
    const first = withAddedBook(undefined, 'Prima Pars', 'Chapter 1');
    expect(first).toEqual([{ label: 'Prima Pars', chapters: [{ label: 'Chapter 1' }] }]);
    // A later book starts empty.
    const two = withAddedBook(first, 'Secunda Pars');
    expect(two[1]).toEqual({ label: 'Secunda Pars', chapters: [] });
    // Add a chapter to book 1; book 2 untouched.
    const added = withAddedChapter(two, 1, 'Question 3');
    expect(added[0].chapters).toEqual([{ label: 'Chapter 1' }, { label: 'Question 3' }]);
    expect(added[1].chapters).toEqual([]);
    // Rename book 2 and chapter (1,2); out-of-range indices are no-ops.
    expect(withRenamedBook(added, 2, 'Pars II')[1].label).toBe('Pars II');
    expect(withRenamedChapter(added, 1, 2, 'Q. 3')[0].chapters[1].label).toBe('Q. 3');
    expect(withAddedChapter(added, 9, 'x')).toEqual(added);
    expect(withRenamedBook(added, 9, 'x')).toEqual(added);
    expect(withRenamedChapter(added, 1, 9, 'x')).toEqual(added);
  });
});

describe('freeWorkManifest — verbatim language label (D8 Phase E2)', () => {
  it("carries the record's language VERBATIM for assist prompt wording", () => {
    expect(freeWorkManifest({ ...RECORD, language: 'German' }).language).toBe('German');
    expect(freeWorkManifest({ ...RECORD, language: 'Greek' }).language).toBe('Greek');
  });

  it('no language recorded → no language field (assist treats it as unknown, never Greek)', () => {
    expect('language' in freeWorkManifest(RECORD)).toBe(false);
  });
});
