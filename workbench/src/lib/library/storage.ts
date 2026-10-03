// Library storage — the user's canonical chapter files (and small regenerable
// indexes) live behind this interface. ORCHESTRATOR-PINNED CONTRACT: agents
// build against it; changes need sign-off.
//
// Layout (Phase 1):
//   Tauri:   $APPDATA/library/<workId>/<file>            (plain files)
//   Browser: localStorage["workbench:library:<workId>/<file>"]   (dev harness only)
//
// Phase 2 (build spec §11): the Tauri library root is user-pickable (a plain
// folder synced by iCloud Drive, Google Drive, Dropbox, or similar — see
// settings.ts's `libraryRoot` and library/sync.ts). When set, TauriStorage
// reads/writes ABSOLUTE paths under that folder instead of the AppData
// default; existing callers are unaffected (the interface didn't change).
//
// Chapter files are named  b<book2>c<chapter2>.md  (zero-padded, e.g. b07c17.md);
// regenerable caches sit beside them (e.g. footnote-index.json). No library file may
// start with a dot: the Tauri fs scope refuses dotfiles on Unix.

import { isTauri } from '../runtime';
import { loadSettings, updateSettings } from '../settings';
import { pickStatus } from '../picks';
import type { PickStatus } from '../picks';

/**
 * A file that may exist but could not be read (permission denied, I/O error,
 * a cloud drive that stalled). Never treat it as absent: a caller that writes
 * a fresh file in its place destroys the one it failed to read.
 */
export class StorageReadError extends Error {
  constructor(file: string, cause: unknown) {
    super(`${file} could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'StorageReadError';
  }
}

export interface LibraryStorage {
  /**
   * Returns file content, or null if it doesn't exist. Throws
   * StorageReadError when it may exist but could not be read.
   */
  read(workId: string, file: string): Promise<string | null>;
  /** Writes atomically enough for our needs; creates directories as required. */
  write(workId: string, file: string, content: string): Promise<void>;
  /**
   * Filenames (not paths) present for a work; empty list if it has no folder.
   * Throws StorageReadError when the folder may exist but could not be read.
   */
  list(workId: string): Promise<string[]>;
  /**
   * Last-modified epoch ms, or null if unknown/missing (used by Phase 2 sync
   * safety). Throws StorageReadError when the file may exist but could not be read.
   */
  mtime(workId: string, file: string): Promise<number | null>;
  /**
   * Delete every file a work owns, and the work's own folder. Removing a work
   * that has no files is not an error — the caller has already dropped it from
   * the registry, and a folder that was never written is nothing to mourn.
   */
  remove(workId: string): Promise<void>;
}

export function chapterFileName(book: number, chapter: number): string {
  const b = String(book).padStart(2, '0');
  const c = String(chapter).padStart(2, '0');
  return `b${b}c${c}.md`;
}

const LS_PREFIX = 'workbench:library:';

class BrowserStorage implements LibraryStorage {
  async read(workId: string, file: string): Promise<string | null> {
    return localStorage.getItem(`${LS_PREFIX}${workId}/${file}`);
  }
  async write(workId: string, file: string, content: string): Promise<void> {
    localStorage.setItem(`${LS_PREFIX}${workId}/${file}`, content);
  }
  async list(workId: string): Promise<string[]> {
    const prefix = `${LS_PREFIX}${workId}/`;
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
    return out.sort();
  }
  async mtime(): Promise<number | null> {
    return null;
  }
  async remove(workId: string): Promise<void> {
    const prefix = `${LS_PREFIX}${workId}/`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  }
}

/**
 * Resolves to either an absolute path under the user's chosen library root
 * (with baseDir omitted — the window may use it because the user picked it,
 * see libraryRootProblem), or a relative
 * `library/<workId>` path under $APPDATA (the Phase-1 default, baseDir
 * required). Cached per-process; call invalidateLibraryRootCache() after
 * changing settings.libraryRoot.
 */
let cachedRoot: string | null | undefined; // undefined = not yet resolved

async function resolveRoot(): Promise<string | null> {
  if (cachedRoot !== undefined) return cachedRoot;
  const settings = await loadSettings();
  cachedRoot = settings.libraryRoot ?? null;
  return cachedRoot;
}

/** Call after updateSettings({ libraryRoot }) so the next storage call picks it up. */
export function invalidateLibraryRootCache(): void {
  cachedRoot = undefined;
  instance = null;
}

/**
 * Why the user's own library folder cannot be used, or null when it can (or
 * the library is in app data). Checked at startup: a folder the window may
 * not read would otherwise open as an empty library (sandboxing plan, phase 4).
 */
export async function libraryRootProblem(): Promise<{ path: string; status: Exclude<PickStatus, 'ok'> } | null> {
  const root = (await loadSettings()).libraryRoot;
  if (!root) return null;
  const status = await pickStatus(root, true);
  return status === 'ok' ? null : { path: root, status };
}

/** The picker for a library folder: the whole folder, two levels deep. */
export async function pickLibraryFolder(title: string, defaultPath?: string): Promise<string | null> {
  const dialog = await import('@tauri-apps/plugin-dialog');
  const picked = await dialog.open({
    directory: true,
    recursive: true,
    multiple: false,
    title,
    ...(defaultPath ? { defaultPath } : {}),
  });
  return typeof picked === 'string' ? picked : null;
}

/**
 * Choose the library folder again, the dialog opening at `stored`. The answer
 * becomes the library folder, whether or not it is the same one — the user
 * knows where their library is now. False when cancelled.
 */
export async function repickLibraryRoot(stored: string): Promise<boolean> {
  const picked = await pickLibraryFolder('Choose your library folder', stored);
  if (picked === null) return false;
  await updateSettings({ libraryRoot: picked });
  invalidateLibraryRootCache();
  return true;
}

interface ResolvedPath {
  path: string;
  /** undefined when the path is absolute (custom root) — no baseDir needed. */
  baseDir?: import('@tauri-apps/plugin-fs').BaseDirectory;
}

let tmpSerial = 0;

class TauriStorage implements LibraryStorage {
  private async fs() {
    return import('@tauri-apps/plugin-fs');
  }
  private async resolve(workId: string, file: string): Promise<ResolvedPath> {
    const root = await resolveRoot();
    if (root) {
      // Custom root (Drive-synced folder etc.): absolute path, no baseDir.
      const sep = root.endsWith('/') ? '' : '/';
      return { path: `${root}${sep}${workId}/${file}` };
    }
    const fs = await this.fs();
    return { path: `library/${workId}/${file}`, baseDir: fs.BaseDirectory.AppData };
  }
  private async resolveDir(workId: string): Promise<ResolvedPath> {
    const root = await resolveRoot();
    if (root) {
      const sep = root.endsWith('/') ? '' : '/';
      return { path: `${root}${sep}${workId}` };
    }
    const fs = await this.fs();
    return { path: `library/${workId}`, baseDir: fs.BaseDirectory.AppData };
  }
  async read(workId: string, file: string): Promise<string | null> {
    const fs = await this.fs();
    const { path, baseDir } = await this.resolve(workId, file);
    try {
      if (!(await fs.exists(path, { baseDir }))) return null;
      return await fs.readTextFile(path, { baseDir });
    } catch (err) {
      throw new StorageReadError(file, err);
    }
  }
  async write(workId: string, file: string, content: string): Promise<void> {
    const fs = await this.fs();
    const dir = await this.resolveDir(workId);
    await fs.mkdir(dir.path, { baseDir: dir.baseDir, recursive: true });
    // Write-then-rename: a crash mid-write leaves a stray temp file (which
    // list() hides) and the old file whole, never a truncated chapter. The
    // temp name must not start with a dot: the fs scope's globs skip dotfiles.
    const { path, baseDir } = await this.resolve(workId, file);
    const tmp = `${path}.${++tmpSerial}.tmp`;
    await fs.writeTextFile(tmp, content, { baseDir });
    await fs.rename(tmp, path, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir });
  }
  async list(workId: string): Promise<string[]> {
    const fs = await this.fs();
    const dir = await this.resolveDir(workId);
    try {
      if (!(await fs.exists(dir.path, { baseDir: dir.baseDir }))) return [];
      const entries = await fs.readDir(dir.path, { baseDir: dir.baseDir });
      return entries
        .filter((e) => e.isFile && !e.name.endsWith('.tmp'))
        .map((e) => e.name)
        .sort();
    } catch (err) {
      throw new StorageReadError(`${workId}/`, err);
    }
  }
  async mtime(workId: string, file: string): Promise<number | null> {
    const fs = await this.fs();
    const { path, baseDir } = await this.resolve(workId, file);
    try {
      if (!(await fs.exists(path, { baseDir }))) return null;
      const st = await fs.stat(path, { baseDir });
      return st.mtime ? new Date(st.mtime).getTime() : null;
    } catch (err) {
      throw new StorageReadError(file, err);
    }
  }
  async remove(workId: string): Promise<void> {
    const fs = await this.fs();
    const dir = await this.resolveDir(workId);
    if (!(await fs.exists(dir.path, { baseDir: dir.baseDir }))) return;
    await fs.remove(dir.path, { baseDir: dir.baseDir, recursive: true });
  }
}

let instance: LibraryStorage | null = null;

export function libraryStorage(): LibraryStorage {
  if (!instance) instance = isTauri() ? new TauriStorage() : new BrowserStorage();
  return instance;
}

// ── moving an existing library to a new root (Settings: "Store my library in…") ──

/**
 * Copies every work's files from the CURRENT root to `newRoot` (plain files,
 * additive — never deletes anything from the old location). Call BEFORE
 * updateSettings({ libraryRoot: newRoot }) + invalidateLibraryRootCache(), so
 * this still reads from the old root while writing to the new one. Returns
 * the number of files copied. Tauri only; throws in the browser harness.
 */
export async function copyLibraryToRoot(workIds: string[], newRoot: string): Promise<number> {
  if (!isTauri()) throw new Error('copyLibraryToRoot: Tauri only');
  const fs = await import('@tauri-apps/plugin-fs');
  const from = libraryStorage();
  let copied = 0;
  const sep = newRoot.endsWith('/') ? '' : '/';
  for (const workId of workIds) {
    const files = await from.list(workId);
    if (files.length === 0) continue;
    const destDir = `${newRoot}${sep}${workId}`;
    await fs.mkdir(destDir, { recursive: true });
    for (const file of files) {
      const content = await from.read(workId, file);
      if (content === null) continue;
      await fs.writeTextFile(`${destDir}/${file}`, content);
      copied++;
    }
  }
  return copied;
}
