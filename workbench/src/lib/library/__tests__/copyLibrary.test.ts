import { beforeEach, describe, expect, it, vi } from 'vitest';

// "Copy and switch" (Settings › Library folder) copies the library into a
// folder that may already hold one: a collaborator's, or this user's from
// another Mac. John's rule: never overwrite a file already there. Keep it,
// skip ours, and say what was skipped. works.json is merged, not replaced.
//
// The fs double behaves as tauri-plugin-fs 2.5.1 does (shapes pinned in
// lib/__tests__/fsNotFound.test.ts): createNew refuses an existing file with
// "File exists (os error 17)", a missing file is "(os error 2)", and the scope
// refuses any dotfile. A createNew write creates the file before writing its
// bytes, so a write that fails afterwards leaves a short file behind.

const files = new Map<string, string>();
const unreadable = new Set<string>();
const writes: string[] = [];
const failWrite = new Set<string>();
const onWrite = new Map<string, () => void>();
const failRemove = new Set<string>();
let readHook: ((path: string) => void) | null = null;

const opened = (path: string, e: string) => `failed to open file at path: ${path} with error: ${e}`;

function guard(path: string): void {
  if (path.split('/').some((part) => part.startsWith('.') && part !== '.')) throw `forbidden path: ${path}`;
}

vi.mock('../../runtime', () => ({ isTauri: () => true }));
vi.mock('../../settings', () => ({ loadSettings: async () => ({ libraryRoot: '/lib' }) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  async mkdir() {},
  async readTextFile(path: string) {
    guard(path);
    readHook?.(path);
    if (unreadable.has(path)) throw opened(path, 'Permission denied (os error 13)');
    const body = files.get(path);
    if (body === undefined) throw opened(path, 'No such file or directory (os error 2)');
    return body;
  },
  async writeTextFile(path: string, content: string, options?: { createNew?: boolean }) {
    guard(path);
    if (options?.createNew && files.has(path)) throw opened(path, 'File exists (os error 17)');
    writes.push(path);
    if (failWrite.has(path)) {
      files.set(path, content.slice(0, 2));
      throw `failed to write bytes to file at path: ${path} with error: No space left on device (os error 28)`;
    }
    files.set(path, content);
    onWrite.get(path)?.();
  },
  async remove(path: string) {
    guard(path);
    if (failRemove.has(path)) throw `failed to remove path: ${path} with error: Resource busy (os error 16)`;
    files.delete(path);
  },
  async rename(from: string, to: string) {
    guard(from);
    guard(to);
    writes.push(to);
    files.set(to, files.get(from)!);
    files.delete(from);
  },
  async readDir(dir: string) {
    const names = [...files.keys()]
      .filter((p) => p.startsWith(`${dir}/`) && !p.slice(dir.length + 1).includes('/'))
      .map((p) => p.slice(dir.length + 1));
    if (names.length === 0) throw `failed to read directory at path: ${dir} with error: No such file or directory (os error 2)`;
    return names.map((name) => ({ name, isFile: true }));
  },
}));

import { copyLibraryToRoot } from '../storage';
import { FREE_WORKS_STORAGE_ID } from '../../works/freeWorks';

const registry = (works: { id: string; title: string }[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, ...extra, works: works.map((w) => ({ ...w, citation_scheme: 'paragraph' })) });

beforeEach(() => {
  files.clear();
  unreadable.clear();
  writes.length = 0;
  failWrite.clear();
  onWrite.clear();
  failRemove.clear();
  readHook = null;
});

describe('Copy and switch into a folder that already holds files', () => {
  it('keeps a file already there, byte for byte, and names it as skipped', async () => {
    files.set('/lib/w/b01c01.md', 'ours');
    files.set('/lib/w/b01c02.md', 'ours too');
    files.set('/new/w/b01c01.md', 'theirs');
    const result = await copyLibraryToRoot(['w'], '/new');
    expect(files.get('/new/w/b01c01.md')).toBe('theirs');
    expect(files.get('/new/w/b01c02.md')).toBe('ours too');
    expect(result).toEqual({ copied: 1, skipped: ['w/b01c01.md'] });
  });

  it('merges works.json: every entry already there is kept, ours are added', async () => {
    files.set('/lib/./works.json', registry([{ id: 'mine', title: 'Mine' }, { id: 'shared', title: 'Our title' }]));
    files.set(
      '/new/./works.json',
      registry([{ id: 'shared', title: 'Their title' }, { id: 'theirs', title: 'Theirs' }], { note: 'kept' }),
    );
    const result = await copyLibraryToRoot([FREE_WORKS_STORAGE_ID], '/new');
    const merged = JSON.parse(files.get('/new/./works.json')!);
    expect(merged.note).toBe('kept');
    expect(merged.works.map((w: { id: string; title: string }) => `${w.id}:${w.title}`)).toEqual([
      'shared:Their title',
      'theirs:Theirs',
      'mine:Mine',
    ]);
    expect(result.skipped).toEqual(['“Our title” in the documents list (works.json)']);
  });

  it('copies works.json as it is when the new folder has none', async () => {
    const ours = registry([{ id: 'mine', title: 'Mine' }]);
    files.set('/lib/./works.json', ours);
    expect(await copyLibraryToRoot([FREE_WORKS_STORAGE_ID], '/new')).toEqual({ copied: 1, skipped: [] });
    expect(files.get('/new/./works.json')).toBe(ours);
  });

  it('copies nothing when the works.json already there is damaged', async () => {
    files.set('/lib/w/b01c01.md', 'ours');
    files.set('/lib/./works.json', registry([{ id: 'mine', title: 'Mine' }]));
    files.set('/new/./works.json', '{not json');
    await expect(copyLibraryToRoot(['w', FREE_WORKS_STORAGE_ID], '/new')).rejects.toThrow(/works\.json/);
    expect(writes).toEqual([]);
    expect(files.get('/new/./works.json')).toBe('{not json');
  });

  it('copies nothing when the works.json already there cannot be read', async () => {
    files.set('/lib/w/b01c01.md', 'ours');
    files.set('/lib/./works.json', registry([{ id: 'mine', title: 'Mine' }]));
    files.set('/new/./works.json', registry([{ id: 'theirs', title: 'Theirs' }]));
    unreadable.add('/new/./works.json');
    await expect(copyLibraryToRoot(['w', FREE_WORKS_STORAGE_ID], '/new')).rejects.toThrow(/works\.json/);
    expect(writes).toEqual([]);
  });

  it('leaves a .DS_Store behind instead of failing on it', async () => {
    files.set('/lib/w/b01c01.md', 'ours');
    files.set('/lib/w/.DS_Store', '\u0000\u0001');
    expect(await copyLibraryToRoot(['w'], '/new')).toEqual({ copied: 1, skipped: [] });
    expect(files.has('/new/w/.DS_Store')).toBe(false);
  });

  it('removes the short file a failed write leaves, so a retry copies it whole', async () => {
    files.set('/lib/w/b01c01.md', 'the whole chapter');
    failWrite.add('/new/w/b01c01.md');
    await expect(copyLibraryToRoot(['w'], '/new')).rejects.toMatch(/No space left on device/);
    expect(files.has('/new/w/b01c01.md')).toBe(false);
  });

  it('keeps a works.json entry synced into the new folder while the chapters copied', async () => {
    files.set('/lib/w/b01c01.md', 'ours');
    files.set('/lib/./works.json', registry([{ id: 'mine', title: 'Mine' }]));
    files.set('/new/./works.json', registry([{ id: 'theirs', title: 'Theirs' }]));
    onWrite.set('/new/w/b01c01.md', () =>
      files.set('/new/./works.json', registry([{ id: 'theirs', title: 'Theirs' }, { id: 'late', title: 'Late' }])),
    );
    await copyLibraryToRoot(['w', FREE_WORKS_STORAGE_ID], '/new');
    const ids = JSON.parse(files.get('/new/./works.json')!).works.map((w: { id: string }) => w.id);
    expect(ids).toEqual(['theirs', 'late', 'mine']);
  });

  it('never touches a temp file already in the new folder', async () => {
    files.set('/lib/./works.json', registry([{ id: 'mine', title: 'Mine' }]));
    files.set('/new/./works.json', registry([{ id: 'theirs', title: 'Theirs' }]));
    // Another Mac's saves use the same numbered temp names this app does.
    for (let n = 1; n <= 100; n++) files.set(`/new/./works.json.${n}.tmp`, `another Mac, save ${n}`);
    await copyLibraryToRoot([FREE_WORKS_STORAGE_ID], '/new');
    for (let n = 1; n <= 100; n++) expect(files.get(`/new/./works.json.${n}.tmp`)).toBe(`another Mac, save ${n}`);
  });

  it('adds our entries in order, duplicates too (the app reads the first usable one), and leaves out entries with no id', async () => {
    files.set(
      '/lib/./works.json',
      JSON.stringify({ version: 1, works: [{ title: 'No id' }, { id: 'a', title: 'A' }, { id: 'a', title: 'A again' }] }),
    );
    files.set('/new/./works.json', JSON.stringify({ version: 1, works: [{ title: 'Theirs, no id' }, { id: 'b', title: 'B' }] }));
    const result = await copyLibraryToRoot([FREE_WORKS_STORAGE_ID], '/new');
    const works = JSON.parse(files.get('/new/./works.json')!).works;
    expect(works.map((w: { id?: string; title: string }) => w.title)).toEqual(['Theirs, no id', 'B', 'A', 'A again']);
    expect(result.skipped).toEqual([]);
  });

  it('stops and names a short file it could not remove', async () => {
    files.set('/lib/w/b01c01.md', 'the whole chapter');
    failWrite.add('/new/w/b01c01.md');
    failRemove.add('/new/w/b01c01.md');
    await expect(copyLibraryToRoot(['w'], '/new')).rejects.toThrow(/w\/b01c01\.md.*half-written/);
  });

  it('does not claim other files were copied when none were', async () => {
    files.set('/lib/./works.json', registry([{ id: 'mine', title: 'Mine' }]));
    files.set('/new/./works.json', registry([{ id: 'theirs', title: 'Theirs' }]));
    files.set('/lib/w/b01c01.md', 'ours');
    files.set('/new/w/b01c01.md', 'theirs');
    onWrite.clear();
    // Damaged by sync after the check, before the merge.
    let reads = 0;
    readHook = (path) => {
      if (path === '/new/./works.json' && ++reads === 2) files.set(path, '{not json');
    };
    const err = await copyLibraryToRoot(['w', FREE_WORKS_STORAGE_ID], '/new').catch((e: Error) => e);
    expect(String(err)).toMatch(/damaged/);
    expect(String(err)).not.toMatch(/were copied/);
  });
});
