import { describe, expect, it, vi } from 'vitest';

// settings.json holds libraryRoot: overwrite it with defaults and the library
// opens empty. A settings file the app could not read must not be
// rewritten. (One case per file: settings.ts caches the first load.)

const writes: string[] = [];

vi.mock('../runtime', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  async exists() {
    return true;
  },
  async readTextFile() {
    throw new Error('Operation not permitted (os error 1)');
  },
  async writeTextFile(path: string) {
    writes.push(path);
  },
  async rename(_from: string, to: string) {
    writes.push(to);
  },
}));

import { loadSettings, settingsProblem, updateSettings } from '../settings';

describe('a settings file that could not be read', () => {
  it('is not overwritten, and the app runs on defaults in memory', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await loadSettings()).toEqual({});
      const next = await updateSettings({ lastOpened: { workId: 'w', book: 1, chapter: 2 } });
      expect(next.lastOpened).toEqual({ workId: 'w', book: 1, chapter: 2 });
      expect((await loadSettings()).lastOpened).toEqual({ workId: 'w', book: 1, chapter: 2 });
      expect(writes).toEqual([]);
      expect(settingsProblem()).toMatch(/settings/i);
    } finally {
      warn.mockRestore();
    }
  });
});
