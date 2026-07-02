/**
 * Tiny persisted settings.
 *
 *   Tauri:    $APPDATA/settings.json (plugin-fs)
 *   Browser:  localStorage["workbench:settings"] (dev harness)
 *
 * Holds only what onboarding + startup need: the TLG directory, an optional
 * Diogenes server-dir override, and the last-opened chapter. No settings UI
 * beyond that. All failures degrade to defaults quietly (console-logged).
 */

import { isTauri } from './runtime';

export interface LastOpened {
  workId: string;
  book: number;
  chapter: number;
}

export interface WorkbenchSettings {
  /** Directory containing the TLG texts (AUTHTAB.DIR etc.). */
  tlgDir?: string;
  /** Override for the Diogenes server directory (the one holding xml-export.pl). */
  diogenesPath?: string;
  lastOpened?: LastOpened;
  /**
   * User-chosen folder holding the library (chapter files), e.g. a synced
   * Drive/Dropbox folder shared with a collaborator (build spec §11). Unset
   * means the default `$APPDATA/library` location. Tauri only — the browser
   * dev harness never reads or writes this.
   */
  libraryRoot?: string;
}

const LS_KEY = 'workbench:settings';
const FILE = 'settings.json';

function sanitize(value: unknown): WorkbenchSettings {
  if (typeof value !== 'object' || value === null) return {};
  const v = value as Record<string, unknown>;
  const out: WorkbenchSettings = {};
  if (typeof v.tlgDir === 'string') out.tlgDir = v.tlgDir;
  if (typeof v.diogenesPath === 'string') out.diogenesPath = v.diogenesPath;
  if (typeof v.libraryRoot === 'string') out.libraryRoot = v.libraryRoot;
  const lo = v.lastOpened as Record<string, unknown> | undefined;
  if (
    typeof lo === 'object' &&
    lo !== null &&
    typeof lo.workId === 'string' &&
    typeof lo.book === 'number' &&
    typeof lo.chapter === 'number'
  ) {
    out.lastOpened = { workId: lo.workId, book: lo.book, chapter: lo.chapter };
  }
  return out;
}

async function readRaw(): Promise<string | null> {
  if (isTauri()) {
    const fs = await import('@tauri-apps/plugin-fs');
    try {
      if (!(await fs.exists(FILE, { baseDir: fs.BaseDirectory.AppData }))) return null;
      return await fs.readTextFile(FILE, { baseDir: fs.BaseDirectory.AppData });
    } catch (err) {
      console.warn('settings: read failed', err);
      return null;
    }
  }
  return localStorage.getItem(LS_KEY);
}

async function writeRaw(text: string): Promise<void> {
  if (isTauri()) {
    const fs = await import('@tauri-apps/plugin-fs');
    try {
      await fs.mkdir('', { baseDir: fs.BaseDirectory.AppData, recursive: true });
      await fs.writeTextFile(FILE, text, { baseDir: fs.BaseDirectory.AppData });
    } catch (err) {
      console.warn('settings: write failed', err);
    }
    return;
  }
  localStorage.setItem(LS_KEY, text);
}

let cached: WorkbenchSettings | null = null;

export async function loadSettings(): Promise<WorkbenchSettings> {
  if (cached) return cached;
  const raw = await readRaw();
  if (raw === null) {
    cached = {};
    return cached;
  }
  try {
    cached = sanitize(JSON.parse(raw));
  } catch (err) {
    console.warn('settings: unparsable settings file — starting fresh', err);
    cached = {};
  }
  return cached;
}

/** Merge a patch into the persisted settings (undefined values are dropped). */
export async function updateSettings(
  patch: Partial<WorkbenchSettings>,
): Promise<WorkbenchSettings> {
  const current = await loadSettings();
  const next: WorkbenchSettings = { ...current };
  for (const key of ['tlgDir', 'diogenesPath', 'lastOpened', 'libraryRoot'] as const) {
    if (key in patch) {
      const value = patch[key];
      if (value === undefined) delete (next as Record<string, unknown>)[key];
      else (next as Record<string, unknown>)[key] = value;
    }
  }
  cached = next;
  await writeRaw(JSON.stringify(next, null, 1));
  return next;
}
