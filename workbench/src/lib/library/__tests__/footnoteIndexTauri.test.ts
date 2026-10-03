import { beforeEach, describe, expect, it, vi } from 'vitest';

// The footnote index must survive the real Tauri store: written as a temp file
// and renamed into place, then read back. The mock fs refuses any path with a
// dot-prefixed component, as the `/**` scope does on Unix (glob with
// require_literal_leading_dot, tauri-plugin-fs's default). The in-memory
// storage the other index tests use cannot see that refusal.

const files = new Map<string, string>();

function guard(path: string): void {
  if (path.split('/').some((part) => part.startsWith('.') && part !== '.')) {
    throw new Error(`forbidden path: ${path}`);
  }
}

vi.mock('../../runtime', () => ({ isTauri: () => true }));
vi.mock('../../settings', () => ({ loadSettings: async () => ({ libraryRoot: '/lib' }) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  async mkdir() {},
  async exists(path: string) {
    guard(path);
    return files.has(path);
  },
  async readTextFile(path: string) {
    guard(path);
    const body = files.get(path);
    // tauri-plugin-fs's wording: the OS error text is what says "absent".
    if (body === undefined) throw `failed to open file at path: ${path} with error: No such file or directory (os error 2)`;
    return body;
  },
  async writeTextFile(path: string, content: string) {
    guard(path);
    files.set(path, content);
  },
  async rename(from: string, to: string) {
    guard(from);
    guard(to);
    const body = files.get(from);
    if (body === undefined) throw new Error(`no such file: ${from}`);
    files.delete(from);
    files.set(to, body);
  },
}));

const { libraryStorage, invalidateLibraryRootCache } = await import('../storage');
const { updateFootnoteCount, loadFootnoteIndex } = await import('../footnoteIndex');

describe('footnote index through TauriStorage', () => {
  beforeEach(() => {
    files.clear();
    invalidateLibraryRootCache();
  });

  it('writes through the temp-and-rename path and reads back', async () => {
    await updateFootnoteCount(libraryStorage(), 'meta', 7, 17, 3);
    expect(await loadFootnoteIndex(libraryStorage(), 'meta')).toEqual({
      schemaVersion: 1,
      counts: { b07c17: 3 },
    });
    expect([...files.keys()].filter((p) => p.endsWith('.tmp'))).toEqual([]);
  });
});
