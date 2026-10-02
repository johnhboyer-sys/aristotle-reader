/**
 * Phase 3–4 of workbench-design/sandboxing-plan.md: the window may use a
 * folder or file outside app data only if the user picked it in a native
 * dialog. A stored path that was never picked (every existing user, once) or
 * that has moved must say so and offer to choose it again — never show an
 * empty library or fail without a word.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: { cmd: string; args?: Record<string, unknown> }[] = [];
let status: string | Error = 'ok';
const opens: Record<string, unknown>[] = [];
let picked: string | null = null;
let settings: Record<string, unknown> = {};
const updates: Record<string, unknown>[] = [];

vi.mock('../runtime', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    calls.push({ cmd, args });
    if (status instanceof Error) throw status;
    return status;
  },
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: async (options: Record<string, unknown>) => {
    opens.push(options);
    return picked;
  },
}));
vi.mock('../settings', () => ({
  loadSettings: async () => settings,
  updateSettings: async (patch: Record<string, unknown>) => {
    updates.push(patch);
    settings = { ...settings, ...patch };
    return settings;
  },
}));

const { pickStatus, repickReason, chooseAgainLabel } = await import('../picks');
const { libraryRootProblem, repickLibraryRoot } = await import('../library/storage');
const { pickTlgDir } = await import('../data/onboarding');
const { pickDiscDir } = await import('../import/discImport');

beforeEach(() => {
  calls.length = 0;
  opens.length = 0;
  updates.length = 0;
  status = 'ok';
  picked = null;
  settings = {};
});

describe('pickStatus', () => {
  it('asks Rust, deep or not', async () => {
    status = 'not-picked';
    expect(await pickStatus('/Users/u/Library', true)).toBe('not-picked');
    expect(calls).toEqual([{ cmd: 'pick_status', args: { path: '/Users/u/Library', deep: true } }]);
    status = 'missing';
    expect(await pickStatus('/Users/u/ref.docx')).toBe('missing');
    expect(calls[1].args).toEqual({ path: '/Users/u/ref.docx', deep: false });
  });

  it('treats a failed check as not picked, so the user is asked rather than shown nothing', async () => {
    status = new Error('ipc down');
    expect(await pickStatus('/x')).toBe('not-picked');
  });
});

describe('the reason and the button', () => {
  it('names what to choose again, and why', () => {
    expect(chooseAgainLabel('library')).toBe('Choose your library folder again…');
    expect(chooseAgainLabel('tlg')).toBe('Choose your TLG folder again…');
    expect(chooseAgainLabel('phi')).toBe('Choose your PHI folder again…');
    expect(chooseAgainLabel('reference')).toBe('Choose your reference document again…');
    const notPicked = repickReason('library', 'not-picked', '/Users/u/Drive/Library');
    expect(notPicked).toContain('library folder');
    expect(notPicked).toContain('only');
    expect(notPicked).toContain('chosen');
  });

  it('says where a moved one was', () => {
    const missing = repickReason('tlg', 'missing', '/Volumes/TLG/TLG_E');
    expect(missing).toContain('/Volumes/TLG/TLG_E');
    expect(missing).toContain('TLG folder');
  });
});

describe('folder pickers that are read deeply ask for the whole folder', () => {
  it('the TLG folder for Add work', async () => {
    picked = '/Volumes/TLG/TLG_E';
    expect(await pickTlgDir('/Volumes/TLG/TLG_E')).toBe('/Volumes/TLG/TLG_E');
    expect(opens[0]).toMatchObject({ directory: true, recursive: true, defaultPath: '/Volumes/TLG/TLG_E' });
  });

  it('the disc folder for Import a text', async () => {
    picked = '/Volumes/PHI';
    expect(await pickDiscDir('phi', '/Volumes/PHI')).toBe('/Volumes/PHI');
    expect(opens[0]).toMatchObject({ directory: true, recursive: true, defaultPath: '/Volumes/PHI' });
    await pickDiscDir('tlg');
    expect(opens[1]).toMatchObject({ directory: true, recursive: true });
    expect(opens[1].defaultPath).toBeUndefined();
  });
});

describe('the library folder', () => {
  it('has no problem when it is the default, in app data', async () => {
    expect(await libraryRootProblem()).toBeNull();
    expect(calls).toEqual([]);
  });

  it('has no problem when its pick was kept', async () => {
    settings = { libraryRoot: '/Users/u/Drive/Library' };
    expect(await libraryRootProblem()).toBeNull();
    expect(calls[0]).toEqual({ cmd: 'pick_status', args: { path: '/Users/u/Drive/Library', deep: true } });
  });

  it('asks to be chosen again when it was never picked or has moved', async () => {
    settings = { libraryRoot: '/Users/u/Drive/Library' };
    status = 'not-picked';
    expect(await libraryRootProblem()).toEqual({ path: '/Users/u/Drive/Library', status: 'not-picked' });
    status = 'missing';
    expect(await libraryRootProblem()).toEqual({ path: '/Users/u/Drive/Library', status: 'missing' });
  });

  it('re-picks deeply, opening at the old folder, and stores the answer', async () => {
    settings = { libraryRoot: '/Users/u/Drive/Library' };
    picked = '/Users/u/Drive/Library';
    expect(await repickLibraryRoot('/Users/u/Drive/Library')).toBe(true);
    expect(opens[0]).toMatchObject({ directory: true, recursive: true, defaultPath: '/Users/u/Drive/Library' });
    expect(updates).toEqual([{ libraryRoot: '/Users/u/Drive/Library' }]);
  });

  it('changes nothing when the picker is cancelled', async () => {
    picked = null;
    expect(await repickLibraryRoot('/Users/u/Drive/Library')).toBe(false);
    expect(updates).toEqual([]);
  });
});
