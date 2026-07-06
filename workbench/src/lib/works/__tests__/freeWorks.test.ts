import { describe, expect, it, vi } from 'vitest';
import { MemStorage } from '../../library/__tests__/memStorage';
import {
  FREE_WORKS_STORAGE_ID,
  freeWorkManifest,
  listFreeWorkRecords,
  listFreeWorks,
  registerFreeWork,
} from '../freeWorks';
import type { FreeWorkRecord } from '../freeWorks';

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
    });
  });

  it("maps language onto originalLanguage only when it's greek/latin", () => {
    expect(freeWorkManifest({ ...RECORD, language: 'Greek' }).originalLanguage).toBe('greek');
    expect(freeWorkManifest({ ...RECORD, language: 'latin' }).originalLanguage).toBe('latin');
    expect(freeWorkManifest({ ...RECORD, language: 'German' }).originalLanguage).toBeUndefined();
    expect(freeWorkManifest(RECORD).originalLanguage).toBeUndefined();
  });
});
