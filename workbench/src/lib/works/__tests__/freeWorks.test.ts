import { describe, expect, it, vi } from 'vitest';
import { MemStorage } from '../../library/__tests__/memStorage';
import {
  FREE_WORKS_STORAGE_ID,
  freeWorkManifest,
  listFreeWorkRecords,
  listFreeWorks,
  registerFreeWork,
  removeFreeWork,
  unregisterFreeWork,
  updateFreeWorkAuthor,
  updateFreeWorkBookContainers,
  updateFreeWorkLanguage,
  updateFreeWorkLevels,
  updateFreeWorkTitle,
} from '../freeWorks';
import type { FreeWorkRecord } from '../freeWorks';
import type { BookContainer } from '../bookContainers';
import { DEFAULT_PROFILE } from '../profile';

const RECORD: FreeWorkRecord = { id: 'my-doc', title: 'My Doc', scheme: 'paragraph' };

describe('free-work registry (works.json in the library root)', () => {
  it('is empty when no registry file exists', async () => {
    expect(await listFreeWorkRecords(new MemStorage())).toEqual([]);
    expect(await listFreeWorks(new MemStorage())).toEqual([]);
  });

  it('register → list round-trips records (author trimmed; language kept verbatim)', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, author: '  Jane Austen  ', language: 'German' }, storage);
    await registerFreeWork({ id: 'verse', title: 'Verse', scheme: 'plain-line' }, storage);
    expect(await listFreeWorkRecords(storage)).toEqual([
      { ...RECORD, author: 'Jane Austen', language: 'German' },
      { id: 'verse', title: 'Verse', scheme: 'plain-line' },
    ]);
  });

  it('omits an empty stored author', async () => {
    const storage = new MemStorage();
    await storage.write(
      FREE_WORKS_STORAGE_ID,
      'works.json',
      JSON.stringify({
        version: 1,
        works: [{ id: 'my-doc', title: 'My Doc', author: '   ', citation_scheme: 'paragraph' }],
      }),
    );
    expect(await listFreeWorkRecords(storage)).toEqual([RECORD]);
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

  it('updateFreeWorkAuthor sets, trims, and clears the author without changing other fields', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'Latin' }, storage);

    await updateFreeWorkAuthor('my-doc', '  Thomas Aquinas  ', storage);
    expect((await listFreeWorkRecords(storage))[0]).toEqual({
      ...RECORD,
      author: 'Thomas Aquinas',
      language: 'Latin',
    });

    await updateFreeWorkAuthor('my-doc', '', storage);
    expect((await listFreeWorkRecords(storage))[0]).toEqual({ ...RECORD, language: 'Latin' });
  });

  it("updateFreeWorkAuthor keeps a work's Books and level profile intact", async () => {
    // Author, Books and levels are three separate read-modify-write cycles over
    // the same works.json — saving one must never drop the others.
    const storage = new MemStorage();
    const furnished = {
      ...RECORD,
      levels: [{ name: 'Question', navRole: 'chapter' as const, depth: 0 }],
      bookContainers: [
        { label: 'Prima Pars', start: 1 },
        { label: 'Secunda Pars', start: 4 },
      ],
    };
    await registerFreeWork(furnished, storage);

    await updateFreeWorkAuthor('my-doc', 'Thomas Aquinas', storage);
    expect((await listFreeWorkRecords(storage))[0]).toEqual({
      ...furnished,
      author: 'Thomas Aquinas',
    });
  });

  it('updateFreeWorkAuthor is a no-op for an unknown work id', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkAuthor('nope', 'Nobody', storage);
    expect(await listFreeWorkRecords(storage)).toEqual([RECORD]);
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

  it('surfaces the record author on the manifest', () => {
    expect(freeWorkManifest({ ...RECORD, author: 'Jane Austen' }).author).toBe('Jane Austen');
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

describe('the retired container-slot model', () => {
  // `books` was a hand-made list of Book/Chapter SLOTS, from before Books
  // became boundaries over the outline. Nothing has read it for a while; now
  // nothing parses or writes it either, and a registry that still carries one
  // sheds it on the next write.
  it('ignores a stored books key, and drops it when the registry is next written', async () => {
    const storage = new MemStorage();
    await storage.write(
      FREE_WORKS_STORAGE_ID,
      'works.json',
      JSON.stringify({
        version: 1,
        works: [
          {
            id: 'my-doc',
            title: 'My Doc',
            citation_scheme: 'paragraph',
            books: [{ label: 'Prima Pars', chapters: [{ label: 'Question 2' }] }],
          },
        ],
      }),
    );

    const [record] = await listFreeWorkRecords(storage);
    expect(record).toEqual({ id: 'my-doc', title: 'My Doc', scheme: 'paragraph' });
    expect(freeWorkManifest(record).documentBooks).toBeUndefined();

    await updateFreeWorkAuthor('my-doc', 'Aquinas', storage);
    const parsed = JSON.parse(storage.files.get(`${FREE_WORKS_STORAGE_ID}/works.json`)!);
    expect('books' in parsed.works[0]).toBe(false);
  });

  it('keeps the single-document manifest shape for every free work', () => {
    const m = freeWorkManifest(RECORD);
    expect(m.books).toEqual([{ n: 1, label: '' }]);
    expect(m.documentBooks).toBeUndefined();
  });
});

describe('document Book-container persistence', () => {
  const CONTAINERS: BookContainer[] = [
    { label: 'Prima Pars', start: 1 },
    { label: 'Secunda Pars', start: 4 },
  ];

  it('register → list round-trips Book containers and writes their own registry key', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, bookContainers: CONTAINERS }, storage);

    expect((await listFreeWorkRecords(storage))[0].bookContainers).toEqual(CONTAINERS);
    const parsed = JSON.parse(storage.files.get(`${FREE_WORKS_STORAGE_ID}/works.json`)!);
    expect(parsed.works[0].bookContainers).toEqual(CONTAINERS);
  });

  it('sanitizes bad starts and out-of-order boundaries on registry read', async () => {
    const storage = new MemStorage();
    await storage.write(
      FREE_WORKS_STORAGE_ID,
      'works.json',
      JSON.stringify({
        version: 1,
        works: [
          {
            id: 'my-doc',
            title: 'My Doc',
            citation_scheme: 'paragraph',
            bookContainers: [
              { label: 'I', start: -3 },
              { label: 'II', start: 8 },
              { label: 'III', start: 2 },
            ],
          },
        ],
      }),
    );
    expect((await listFreeWorkRecords(storage))[0].bookContainers).toEqual([
      { label: 'I', start: 1 },
      { label: 'II', start: 8 },
      { label: 'III', start: 8 },
    ]);
  });

  it('surfaces Book containers on the free-work manifest', () => {
    expect(freeWorkManifest({ ...RECORD, bookContainers: CONTAINERS }).documentBookContainers).toEqual(
      CONTAINERS,
    );
  });

  it('updates only Book containers and clears the key for an empty array', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'Latin' }, storage);
    await updateFreeWorkBookContainers('my-doc', CONTAINERS, storage);
    expect(await listFreeWorkRecords(storage)).toEqual([
      { ...RECORD, language: 'Latin', bookContainers: CONTAINERS },
    ]);

    await updateFreeWorkBookContainers('my-doc', [], storage);
    expect((await listFreeWorkRecords(storage))[0].bookContainers).toBeUndefined();
    const parsed = JSON.parse(storage.files.get(`${FREE_WORKS_STORAGE_ID}/works.json`)!);
    expect('bookContainers' in parsed.works[0]).toBe(false);
  });

  it('does nothing for an unknown work id', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkBookContainers('nope', CONTAINERS, storage);
    expect(await listFreeWorkRecords(storage)).toEqual([RECORD]);
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

describe('removing a work', () => {
  const OTHER: FreeWorkRecord = { id: 'keeper', title: 'Keeper', scheme: 'paragraph' };

  async function library(): Promise<MemStorage> {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await registerFreeWork(OTHER, storage);
    await storage.write('my-doc', 'b01c01.md', 'chapter one');
    await storage.write('my-doc', 'b01c02.md', 'chapter two');
    await storage.write('keeper', 'b01c01.md', 'not mine to delete');
    return storage;
  }

  it('drops the registry entry and every file the work owns', async () => {
    const storage = await library();
    await removeFreeWork('my-doc', storage);
    expect((await listFreeWorkRecords(storage)).map((w) => w.id)).toEqual(['keeper']);
    expect(await storage.list('my-doc')).toEqual([]);
  });

  it('leaves every other work exactly as it was', async () => {
    const storage = await library();
    await removeFreeWork('my-doc', storage);
    expect(await storage.read('keeper', 'b01c01.md')).toBe('not mine to delete');
    expect((await listFreeWorks(storage)).map((w) => w.title)).toEqual(['Keeper']);
  });

  it('still clears the files of a work the registry never knew', async () => {
    // A half-finished import: files written, registration never reached.
    const storage = new MemStorage();
    await registerFreeWork(OTHER, storage);
    await storage.write('orphan', 'b01c01.md', 'nobody knows me');
    await removeFreeWork('orphan', storage);
    expect(await storage.list('orphan')).toEqual([]);
    expect((await listFreeWorkRecords(storage)).map((w) => w.id)).toEqual(['keeper']);
  });

  it('unregisters without touching the files when asked only to unregister', async () => {
    const storage = await library();
    await unregisterFreeWork('my-doc', storage);
    expect((await listFreeWorkRecords(storage)).map((w) => w.id)).toEqual(['keeper']);
    expect(await storage.list('my-doc')).toEqual(['b01c01.md', 'b01c02.md']);
  });
});

describe('setting a work’s language after the fact', () => {
  it('changes which dictionary the work will get', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'Greek' }, storage);
    await updateFreeWorkLanguage('my-doc', 'Latin', storage);
    const [work] = await listFreeWorks(storage);
    expect(work.language).toBe('Latin');
    expect(work.originalLanguage).toBe('latin');
  });

  it('keeps a language no dictionary knows, and claims none for it', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkLanguage('my-doc', '  German  ', storage);
    const [work] = await listFreeWorks(storage);
    expect(work.language).toBe('German');
    expect(work.originalLanguage).toBeUndefined();
  });

  it('clears the language when the field is emptied', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, language: 'Greek' }, storage);
    await updateFreeWorkLanguage('my-doc', '   ', storage);
    const [record] = await listFreeWorkRecords(storage);
    expect('language' in record).toBe(false);
  });

  it('leaves everything else on the record alone', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, author: 'Aquinas', language: 'Latin' }, storage);
    await updateFreeWorkLanguage('my-doc', 'Greek', storage);
    const [record] = await listFreeWorkRecords(storage);
    expect(record.author).toBe('Aquinas');
    expect(record.title).toBe('My Doc');
  });
});

describe('renaming a work', () => {
  it('changes the title and leaves the id — the files live under it', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await storage.write('my-doc', 'b01c01.md', 'chapter one');

    await updateFreeWorkTitle('my-doc', 'Summa Theologiae, Prima Pars', storage);

    const [record] = await listFreeWorkRecords(storage);
    expect(record.title).toBe('Summa Theologiae, Prima Pars');
    expect(record.id).toBe('my-doc');
    expect(await storage.read('my-doc', 'b01c01.md')).toBe('chapter one');
  });

  it('trims what the user typed', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkTitle('my-doc', '  Physica  ', storage);
    expect((await listFreeWorkRecords(storage))[0].title).toBe('Physica');
  });

  it('refuses to leave a work nameless', async () => {
    const storage = new MemStorage();
    await registerFreeWork(RECORD, storage);
    await updateFreeWorkTitle('my-doc', '   ', storage);
    expect((await listFreeWorkRecords(storage))[0].title).toBe('My Doc');
  });

  it('keeps the author and language it was not asked about', async () => {
    const storage = new MemStorage();
    await registerFreeWork({ ...RECORD, author: 'Aquinas', language: 'Latin' }, storage);
    await updateFreeWorkTitle('my-doc', 'Summa', storage);
    const [record] = await listFreeWorkRecords(storage);
    expect(record.author).toBe('Aquinas');
    expect(record.language).toBe('Latin');
  });
});
