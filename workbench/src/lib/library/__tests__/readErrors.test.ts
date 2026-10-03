import { beforeEach, describe, expect, it, vi } from 'vitest';

// A library file that exists but cannot be read (permission denied, I/O error,
// a cloud drive that stalls) must not look absent: each caller below writes a
// fresh file where it finds none, over the one it failed to read.

const files = new Map<string, string>();
const unreadable = new Set<string>();
const writes: string[] = [];

vi.mock('../../runtime', () => ({ isTauri: () => true }));
vi.mock('../../settings', () => ({ loadSettings: async () => ({ libraryRoot: '/lib' }) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  async mkdir() {},
  async exists(path: string) {
    return files.has(path) || [...files.keys()].some((p) => p.startsWith(`${path}/`));
  },
  async stat(path: string) {
    if (unreadable.has(path)) throw new Error('Operation not permitted (os error 1)');
    if (!files.has(path)) throw new Error(`no such file: ${path}`);
    return { mtime: new Date(1_700_000_000_000) };
  },
  async readTextFile(path: string) {
    if (unreadable.has(path)) throw new Error('Operation not permitted (os error 1)');
    const body = files.get(path);
    if (body === undefined) throw new Error(`no such file: ${path}`);
    return body;
  },
  async writeTextFile(path: string, content: string) {
    writes.push(path);
    files.set(path, content);
  },
  async readDir(dir: string) {
    if (unreadable.has(dir)) throw new Error('Operation not permitted (os error 1)');
    if (![...files.keys()].some((p) => p.startsWith(`${dir}/`))) throw new Error(`no such directory: ${dir}`);
    return [...files.keys()]
      .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
      .map((p) => ({ name: p.slice(dir.length + 1), isFile: true }));
  },
  async rename(from: string, to: string) {
    files.set(to, files.get(from)!);
    files.delete(from);
  },
}));

import { copyLibraryToRoot, libraryStorage } from '../storage';
import { loadChapterFile } from '../autosave';
import { updateFootnoteCount } from '../footnoteIndex';
import { registerFreeWork } from '../../works/freeWorks';
import { chapterFileExists } from '../../import/plan';

beforeEach(() => {
  files.clear();
  unreadable.clear();
  writes.length = 0;
});

describe('opening a chapter whose file cannot be read', () => {
  it('reports an error instead of a fresh chapter, and writes nothing', async () => {
    files.set('/lib/w/b01c01.md', 'the real chapter');
    unreadable.add('/lib/w/b01c01.md');
    const res = await loadChapterFile(libraryStorage(), 'w', 'b01c01.md');
    expect(res.file).toBeNull();
    expect(res.error).toMatch(/could not be read/);
    expect(writes).toEqual([]);
    expect(files.get('/lib/w/b01c01.md')).toBe('the real chapter');
  });

  it('still treats a missing file as a fresh chapter', async () => {
    expect(await loadChapterFile(libraryStorage(), 'w', 'b01c02.md')).toEqual({ file: null, error: null });
  });
});

describe('the other writers that read first', () => {
  it('registerFreeWork leaves an unreadable works registry alone', async () => {
    const registry = '{"version": 1, "works": [{"id": "other", "title": "Other", "citation_scheme": "paragraph"}]}';
    files.set('/lib/./works.json', registry);
    unreadable.add('/lib/./works.json');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(registerFreeWork({ id: 'mine', title: 'Mine', scheme: 'paragraph' })).rejects.toThrow(
        /works\.json\) could not be read/,
      );
    } finally {
      error.mockRestore();
    }
    expect(writes).toEqual([]);
    expect(files.get('/lib/./works.json')).toBe(registry);
  });

  it('copyLibraryToRoot stops rather than leave an unreadable file behind', async () => {
    files.set('/lib/w/b01c01.md', 'one');
    files.set('/lib/w/b01c02.md', 'two');
    unreadable.add('/lib/w/b01c02.md');
    await expect(copyLibraryToRoot(['w'], '/new')).rejects.toThrow(/b01c02\.md could not be read/);
  });

  it('updateFootnoteCount keeps an unreadable index rather than rebuild it from one chapter', async () => {
    files.set('/lib/w/footnote-index.json', '{"version": 1, "counts": {"1.1": 4}}');
    unreadable.add('/lib/w/footnote-index.json');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await updateFootnoteCount(libraryStorage(), 'w', 1, 2, 3)).toBe(false);
    } finally {
      warn.mockRestore();
    }
    expect(writes).toEqual([]);
  });

  it("the import's duplicate check fails instead of answering 'no such chapter'", async () => {
    files.set('/lib/w/b01c01.md', 'the real chapter');
    unreadable.add('/lib/w/b01c01.md');
    await expect(chapterFileExists('w', 1, 1)).rejects.toThrow(/could not be read/);
    expect(await chapterFileExists('w', 1, 2)).toBe(false);
  });
});

describe('listing a folder or stating a file that cannot be read', () => {
  it('list fails instead of answering "no files"', async () => {
    files.set('/lib/w/b01c01.md', 'one');
    unreadable.add('/lib/w');
    await expect(libraryStorage().list('w')).rejects.toThrow(/could not be read/);
  });

  it('list still answers [] for a work with no folder yet', async () => {
    expect(await libraryStorage().list('new-work')).toEqual([]);
  });

  it('copyLibraryToRoot stops rather than skip a work it could not list', async () => {
    files.set('/lib/w/b01c01.md', 'one');
    unreadable.add('/lib/w');
    await expect(copyLibraryToRoot(['w'], '/new')).rejects.toThrow(/could not be read/);
    expect(writes).toEqual([]);
  });

  it('mtime fails instead of answering "unknown"', async () => {
    files.set('/lib/w/b01c01.md', 'one');
    unreadable.add('/lib/w/b01c01.md');
    await expect(libraryStorage().mtime('w', 'b01c01.md')).rejects.toThrow(/could not be read/);
  });

  it('mtime still answers null for a missing file, and the time for a present one', async () => {
    files.set('/lib/w/b01c01.md', 'one');
    expect(await libraryStorage().mtime('w', 'b01c02.md')).toBeNull();
    expect(await libraryStorage().mtime('w', 'b01c01.md')).toBe(1_700_000_000_000);
  });
});
