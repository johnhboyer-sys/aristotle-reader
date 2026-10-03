import { describe, expect, it, vi } from 'vitest';

// The other side of settingsReadError: a settings file that simply isn't there
// yet (first launch) is not a problem, and the first change is saved.
// (One case per file: settings.ts caches the first load.)

const writes: string[] = [];

vi.mock('../runtime', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 'AppData' },
  async exists() {
    return false;
  },
  async readTextFile() {
    // tauri-plugin-fs 2.5.1's wording for a missing file.
    throw 'failed to open file at path: settings.json with error: No such file or directory (os error 2)';
  },
  async writeTextFile(path: string) {
    writes.push(path);
  },
  async rename(_from: string, to: string) {
    writes.push(to);
  },
}));

import { loadSettings, settingsProblem, updateSettings } from '../settings';

describe('a settings file that does not exist yet', () => {
  it('starts on defaults with no problem, and saves the first change', async () => {
    expect(await loadSettings()).toEqual({});
    expect(settingsProblem()).toBeNull();
    await updateSettings({ lastOpened: { workId: 'w', book: 1, chapter: 2 } });
    expect(writes).toContain('settings.json');
  });
});
