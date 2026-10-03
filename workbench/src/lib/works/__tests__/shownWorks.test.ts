// No works ship preinstalled (B12, John 2026-10-03). A built-in work is
// listed only once it is this user's: its library folder holds files, or Add
// work put its corpus on this Mac. The corpus store and the library storage are
// mocked, so each case says exactly what is on disk.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const corpusOnMac = new Set<string>();
const libraryFiles: Record<string, string[] | Error> = {};

vi.mock('../../data/corpusStore', () => ({
  loadCorpus: vi.fn(async (workId: string) =>
    corpusOnMac.has(workId) ? { spine: { segments: [] }, chapters: [] } : null,
  ),
}));

vi.mock('../../library/storage', () => ({
  libraryStorage: () => ({
    list: vi.fn(async (workId: string) => {
      const files = libraryFiles[workId];
      if (files instanceof Error) throw files;
      return files ?? [];
    }),
  }),
}));

import { shownBuiltInWorks } from '../shownWorks';

const ids = async () => (await shownBuiltInWorks()).map((w) => w.id);

beforeEach(() => {
  corpusOnMac.clear();
  for (const key of Object.keys(libraryFiles)) delete libraryFiles[key];
});

describe('built-in works in the library', () => {
  it('an empty library lists no works', async () => {
    expect(await ids()).toEqual([]);
  });

  it('a library holding Metaphysics files lists the Metaphysics, and only it', async () => {
    libraryFiles.metaphysics = ['b01c01.md', 'b01c02.md'];
    const shown = await shownBuiltInWorks();
    expect(shown.map((w) => w.id)).toEqual(['metaphysics']);
    // The manifest is the built-in one, unchanged, so the work opens as before.
    expect(shown[0].title).toBe('Metaphysics');
    expect(shown[0].scheme).toBe('bekker-metaphysics');
    expect(shown[0].books).toHaveLength(14);
  });

  it('Metaphysics files plus its corpus: listed, ready to open', async () => {
    libraryFiles.metaphysics = ['b01c01.md'];
    corpusOnMac.add('metaphysics');
    expect(await ids()).toEqual(['metaphysics']);
  });

  it('a work Add work just set up is listed before any file is written', async () => {
    corpusOnMac.add('posterior-analytics');
    expect(await ids()).toEqual(['posterior-analytics']);
  });

  it('a library folder that cannot be read keeps its work listed', async () => {
    libraryFiles.metaphysics = new Error('EACCES');
    expect(await ids()).toEqual(['metaphysics']);
  });
});
