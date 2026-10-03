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
import { isAlreadyExists, isNotFound, isWriteAfterCreate } from '../fsNotFound';
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
      return await fs.readTextFile(path, { baseDir });
    } catch (err) {
      if (isNotFound(err)) return null;
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
      const entries = await fs.readDir(dir.path, { baseDir: dir.baseDir });
      return entries
        .filter((e) => e.isFile && !e.name.endsWith('.tmp'))
        .map((e) => e.name)
        .sort();
    } catch (err) {
      if (isNotFound(err)) return [];
      throw new StorageReadError(`${workId}/`, err);
    }
  }
  async mtime(workId: string, file: string): Promise<number | null> {
    const fs = await this.fs();
    const { path, baseDir } = await this.resolve(workId, file);
    try {
      const st = await fs.stat(path, { baseDir });
      return st.mtime ? new Date(st.mtime).getTime() : null;
    } catch (err) {
      if (isNotFound(err)) return null;
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

// The free-work registry: freeWorks.ts's FREE_WORKS_STORAGE_ID and its file.
// Named here, not imported, because freeWorks.ts imports this module.
const REGISTRY_WORK_ID = '.';
const REGISTRY_FILE = 'works.json';

export interface CopyResult {
  /** Files written into the new folder (a merged works.json counts as one). */
  copied: number;
  /** What the new folder already held, kept as it was with ours left out:
   * "<workId>/<file>", or a works.json entry by its title. */
  skipped: string[];
}

/** The copy stopped; the message is a sentence for the user. */
export class CopyStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CopyStoppedError';
  }
}

const STOPPED_BEFORE = 'so nothing was copied and the library folder was not changed.';
const stoppedAfter = (copied: number) =>
  `so it was left as it was and the library folder was not changed.${
    copied > 0 ? ' Your other files were copied into the new folder.' : ''
  }`;

function parseRegistry(raw: string, which: string, stopped: string): { object: Record<string, unknown>; works: unknown[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  const works = (parsed as { works?: unknown } | null)?.works;
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray(works)) {
    throw new CopyStoppedError(`${which} is damaged, ${stopped}`);
  }
  return { object: parsed as Record<string, unknown>, works };
}

function entryField(entry: unknown, key: 'id' | 'title'): string | null {
  const value = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' ? value : null;
}

/**
 * Copies every work's files from the CURRENT root to `newRoot` (plain files,
 * additive — never deletes anything from the old location). Call BEFORE
 * updateSettings({ libraryRoot: newRoot }) + invalidateLibraryRootCache(), so
 * this still reads from the old root while writing to the new one. Tauri only;
 * throws in the browser harness.
 *
 * The new folder may already hold a library (a collaborator's, or this user's
 * from another Mac), and nothing in it is ever overwritten (John, 2026-10-03):
 * a file already there is kept and ours is reported in `skipped`. works.json
 * is merged instead: every entry already there is kept as it is, and ours are
 * added where their id is new. Both registries are checked before anything is
 * copied, so one that can't be read or parsed stops the copy with nothing
 * written; the merge itself is made last, against the new folder's works.json
 * as it is then, so an entry synced in while the chapters copied is kept.
 * Dotfiles (.DS_Store) stay behind: no library file starts with a dot, and
 * the fs scope refuses to read one. A process killed mid-file can still leave
 * a short file, which a later copy would keep.
 */
export async function copyLibraryToRoot(workIds: string[], newRoot: string): Promise<CopyResult> {
  if (!isTauri()) throw new Error('copyLibraryToRoot: Tauri only');
  const fs = await import('@tauri-apps/plugin-fs');
  const from = libraryStorage();
  const result: CopyResult = { copied: 0, skipped: [] };
  const sep = newRoot.endsWith('/') ? '' : '/';
  const registryDest = `${newRoot}${sep}${REGISTRY_WORK_ID}/${REGISTRY_FILE}`;

  /** Write only if nothing is there; false when something already was. */
  async function writeNew(path: string, content: string): Promise<boolean> {
    try {
      await fs.writeTextFile(path, content, { createNew: true });
      return true;
    } catch (err) {
      if (isAlreadyExists(err)) return false;
      // Created, then the bytes failed: remove the short file, or the next
      // copy would find it already there and keep it.
      if (isWriteAfterCreate(err)) {
        try {
          await fs.remove(path);
        } catch (removeErr) {
          console.error('copyLibraryToRoot: a short file could not be removed', removeErr);
          throw new CopyStoppedError(
            `${path.slice(newRoot.length + sep.length)} was left half-written in the new folder and could not be removed. Delete it before copying again; the library folder was not changed.`,
          );
        }
      }
      throw err;
    }
  }

  async function readTheirs(stopped: string): Promise<string | null> {
    try {
      return await fs.readTextFile(registryDest);
    } catch (err) {
      if (isNotFound(err)) return null;
      console.error('copyLibraryToRoot: the new folder’s works.json could not be read', err);
      throw new CopyStoppedError(`The documents list (works.json) in the new folder could not be read, ${stopped}`);
    }
  }

  // Check both registries before anything is copied.
  const ours = workIds.includes(REGISTRY_WORK_ID) ? await from.read(REGISTRY_WORK_ID, REGISTRY_FILE) : null;
  if (ours !== null) {
    const theirs = await readTheirs(STOPPED_BEFORE);
    if (theirs !== null) {
      parseRegistry(ours, 'Your documents list (works.json)', STOPPED_BEFORE);
      parseRegistry(theirs, 'The documents list (works.json) in the new folder', STOPPED_BEFORE);
    }
  }

  for (const workId of workIds) {
    const files = (await from.list(workId)).filter(
      (file) => !file.startsWith('.') && !(workId === REGISTRY_WORK_ID && file === REGISTRY_FILE),
    );
    if (files.length === 0) continue;
    const destDir = `${newRoot}${sep}${workId}`;
    await fs.mkdir(destDir, { recursive: true });
    for (const file of files) {
      const content = await from.read(workId, file);
      if (content === null) continue;
      if (await writeNew(`${destDir}/${file}`, content)) result.copied++;
      else result.skipped.push(`${workId}/${file}`);
    }
  }

  if (ours !== null) await mergeRegistry(ours);
  return result;

  /** works.json last, against the new folder's copy as it is now. */
  async function mergeRegistry(ours: string): Promise<void> {
    // Twice at most: a works.json that appears between our read and our
    // createNew is merged on the second pass rather than replaced.
    for (let attempt = 0; attempt < 2; attempt++) {
      const stopped = stoppedAfter(result.copied);
      const theirs = await readTheirs(stopped);
      if (theirs === null) {
        if (await writeNew(registryDest, ours)) {
          result.copied++;
          return;
        }
        continue;
      }
      const mine = parseRegistry(ours, 'Your documents list (works.json)', stopped);
      const target = parseRegistry(theirs, 'The documents list (works.json) in the new folder', stopped);
      const theirIds = new Set(target.works.map((entry) => entryField(entry, 'id')).filter((id) => id !== null));
      // Ours go in, in their order and with any duplicates: the app reads the
      // first usable entry for an id, so it reads the same one it did before.
      const added: unknown[] = [];
      const reported = new Set<string>();
      for (const entry of mine.works) {
        const id = entryField(entry, 'id');
        // An entry with no id is unusable: the app skips it when it reads the list.
        if (id === null) continue;
        if (!theirIds.has(id)) {
          added.push(entry);
        } else if (!reported.has(id)) {
          reported.add(id);
          result.skipped.push(`“${entryField(entry, 'title') ?? id}” in the documents list (works.json)`);
        }
      }
      if (added.length === 0) return;
      // The merge replaces works.json, holding every entry it held. Its temp
      // name is new and made with createNew: a temp file already there may be
      // another Mac's save in progress.
      const tmp = `${registryDest}.${Date.now()}-${Math.random().toString(36).slice(2, 10)}.tmp`;
      if (!(await writeNew(tmp, JSON.stringify({ ...target.object, works: [...target.works, ...added] }, null, 2) + '\n'))) {
        throw new CopyStoppedError(`The documents list (works.json) could not be merged, ${stopped}`);
      }
      await fs.rename(tmp, registryDest);
      result.copied++;
      return;
    }
    throw new CopyStoppedError(`The documents list (works.json) in the new folder kept changing, ${stoppedAfter(result.copied)}`);
  }
}
