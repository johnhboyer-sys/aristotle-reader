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
// regenerable caches are dot-prefixed (e.g. .footnote-index.json).

import { isTauri } from '../runtime';
import { loadSettings } from '../settings';

export interface LibraryStorage {
  /** Returns file content, or null if it doesn't exist. */
  read(workId: string, file: string): Promise<string | null>;
  /** Writes atomically enough for our needs; creates directories as required. */
  write(workId: string, file: string, content: string): Promise<void>;
  /** Filenames (not paths) present for a work; empty list if none. */
  list(workId: string): Promise<string[]>;
  /** Last-modified epoch ms, or null if unknown/missing (used by Phase 2 sync safety). */
  mtime(workId: string, file: string): Promise<number | null>;
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
}

/**
 * Resolves to either an absolute path under the user's chosen library root
 * (with baseDir omitted — the fs:allow-* '/**' scopes in
 * src-tauri/capabilities/default.json cover it), or a relative
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

interface ResolvedPath {
  path: string;
  /** undefined when the path is absolute (custom root) — no baseDir needed. */
  baseDir?: import('@tauri-apps/plugin-fs').BaseDirectory;
}

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
    } catch {
      return null;
    }
  }
  async write(workId: string, file: string, content: string): Promise<void> {
    const fs = await this.fs();
    const dir = await this.resolveDir(workId);
    await fs.mkdir(dir.path, { baseDir: dir.baseDir, recursive: true });
    const { path, baseDir } = await this.resolve(workId, file);
    await fs.writeTextFile(path, content, { baseDir });
  }
  async list(workId: string): Promise<string[]> {
    const fs = await this.fs();
    const dir = await this.resolveDir(workId);
    try {
      const entries = await fs.readDir(dir.path, { baseDir: dir.baseDir });
      return entries
        .filter((e) => e.isFile)
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }
  async mtime(workId: string, file: string): Promise<number | null> {
    const fs = await this.fs();
    const { path, baseDir } = await this.resolve(workId, file);
    try {
      const st = await fs.stat(path, { baseDir });
      return st.mtime ? new Date(st.mtime).getTime() : null;
    } catch {
      return null;
    }
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
