import { beforeEach, describe, expect, it, vi } from 'vitest';

// A save must never leave a chapter file (or works.json) half-written. The
// Tauri store writes a temp file beside the target and renames it into place;
// a crash mid-write leaves a stray temp file and the old chapter intact.

const files = new Map<string, string>();
const calls: string[] = [];

vi.mock('../../runtime', () => ({ isTauri: () => true }));
vi.mock('../../settings', () => ({ loadSettings: async () => ({ libraryRoot: '/lib' }) }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  async mkdir() {},
  async exists(path: string) {
    return files.has(path) || [...files.keys()].some((p) => p.startsWith(`${path}/`));
  },
  async writeTextFile(path: string, content: string) {
    calls.push(`write ${path}`);
    files.set(path, content);
  },
  async rename(from: string, to: string) {
    calls.push(`rename ${from} -> ${to}`);
    const body = files.get(from);
    if (body === undefined) throw new Error(`no such file: ${from}`);
    files.delete(from);
    files.set(to, body);
  },
  async readDir(dir: string) {
    return [...files.keys()]
      .filter((p) => p.startsWith(`${dir}/`))
      .map((p) => ({ name: p.slice(dir.length + 1), isFile: true }));
  },
}));

const { libraryStorage, invalidateLibraryRootCache } = await import('../storage');

describe('TauriStorage.write', () => {
  beforeEach(() => {
    files.clear();
    calls.length = 0;
    invalidateLibraryRootCache();
  });

  it('writes a temp file and renames it over the chapter', async () => {
    await libraryStorage().write('physica', 'b01c01.md', 'new text');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^write \/lib\/physica\/b01c01\.md\.\d+\.tmp$/);
    expect(calls[1]).toMatch(/^rename \/lib\/physica\/b01c01\.md\.\d+\.tmp -> \/lib\/physica\/b01c01\.md$/);
    expect(files.get('/lib/physica/b01c01.md')).toBe('new text');
  });

  // The fs scope's globs skip dotfiles on Unix (requireLiteralLeadingDot), so
  // a dot-prefixed temp would be refused and every save would fail.
  it('never names the temp file with a leading dot', async () => {
    await libraryStorage().write('.', 'works.json', '[]');
    expect(calls[0]).not.toMatch(/\/\.[^/]*$/);
  });

  it('never lists a stray temp file left by a crash', async () => {
    files.set('/lib/physica/b01c01.md', 'old text');
    files.set('/lib/physica/b01c01.md.7.tmp', 'half a chap');
    expect(await libraryStorage().list('physica')).toEqual(['b01c01.md']);
  });
});
