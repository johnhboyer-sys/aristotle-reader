// Library storage — the user's canonical chapter files (and small regenerable
// indexes) live behind this interface. ORCHESTRATOR-PINNED CONTRACT: agents
// build against it; changes need sign-off.
//
// Layout (Phase 1):
//   Tauri:   $APPDATA/library/<workId>/<file>            (plain files — Drive-syncable in Phase 2)
//   Browser: localStorage["workbench:library:<workId>/<file>"]   (dev harness only)
//
// Chapter files are named  b<book2>c<chapter2>.md  (zero-padded, e.g. b07c17.md);
// regenerable caches are dot-prefixed (e.g. .footnote-index.json).

import { isTauri } from '../runtime';

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

class TauriStorage implements LibraryStorage {
  private async fs() {
    return import('@tauri-apps/plugin-fs');
  }
  private dir(workId: string): string {
    return `library/${workId}`;
  }
  async read(workId: string, file: string): Promise<string | null> {
    const fs = await this.fs();
    const path = `${this.dir(workId)}/${file}`;
    try {
      if (!(await fs.exists(path, { baseDir: fs.BaseDirectory.AppData }))) return null;
      return await fs.readTextFile(path, { baseDir: fs.BaseDirectory.AppData });
    } catch {
      return null;
    }
  }
  async write(workId: string, file: string, content: string): Promise<void> {
    const fs = await this.fs();
    await fs.mkdir(this.dir(workId), { baseDir: fs.BaseDirectory.AppData, recursive: true });
    await fs.writeTextFile(`${this.dir(workId)}/${file}`, content, {
      baseDir: fs.BaseDirectory.AppData,
    });
  }
  async list(workId: string): Promise<string[]> {
    const fs = await this.fs();
    try {
      const entries = await fs.readDir(this.dir(workId), { baseDir: fs.BaseDirectory.AppData });
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
    try {
      const st = await fs.stat(`${this.dir(workId)}/${file}`, {
        baseDir: fs.BaseDirectory.AppData,
      });
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
