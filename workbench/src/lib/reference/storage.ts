// Reference-translation storage — imported OCR of copyrighted translations
// the user personally owns, for private study only. ORCHESTRATOR-PINNED
// CONTRACT: agents build against this interface; changes need sign-off.
//
// Reference text is private-study OCR of copyrighted works. It lives ONLY
// under referenceRoot (user data). It must never be bundled, synced, or
// committed. referenceRoot is NEVER derived from libraryRoot: co-locating
// reference text with the synced library folder would push copyrighted OCR
// into a Drive/Dropbox folder a collaborator's machine also syncs (design doc
// D5 S1a/S2/S3). References are local-only per machine — each person OCRs
// their own copy if they want one.
//
// Layout:
//   Tauri:   $APPDATA/references/<workId>/<slug>/{manifest.json, chapter-<b2>-<c2>.md}
//            (or <referenceRoot>/<workId>/<slug>/… when settings.referenceRoot is set —
//            absolute path, no baseDir, mirroring library/storage.ts's custom-root case)
//   Browser: localStorage["workbench:reference:<workId>/<slug>/<file>"]  (dev harness only)
//
// File format for chapter-<b2>-<c2>.md — flat front-matter + verbatim body:
//
//   ---
//   work: metaphysics
//   book: 7
//   chapter: 17
//   edition: ross
//   ---
//   <body text, verbatim aside from normalize.ts's line-ending/soft-hyphen shaping>

import { isTauri } from '../runtime';
import { loadSettings } from '../settings';

export interface ReferenceChapterFrontMatter {
  work: string;
  book: number;
  chapter: number;
  edition: string;
}

export interface ReferenceStorage {
  /** Returns file content, or null if it doesn't exist. */
  read(workId: string, slug: string, file: string): Promise<string | null>;
  /** Writes atomically enough for our needs; creates directories as required. */
  write(workId: string, slug: string, file: string, content: string): Promise<void>;
  /** Filenames (not paths) present for an edition; empty list if none. */
  list(workId: string, slug: string): Promise<string[]>;
  /** Deletes a single file; no-op if it doesn't exist. */
  remove(workId: string, slug: string, file: string): Promise<void>;
  /** Slugs (edition directories) present for a work; empty list if none. */
  listEditions(workId: string): Promise<string[]>;
  /** Deletes an entire edition directory (all files); no-op if it doesn't exist. */
  removeEdition(workId: string, slug: string): Promise<void>;
}

export const MANIFEST_FILE = 'manifest.json';

/** Serialize a chapter file: flat front-matter + verbatim body. */
export function serializeReferenceChapterFile(
  meta: ReferenceChapterFrontMatter,
  body: string,
): string {
  const fm = [
    '---',
    `work: ${meta.work}`,
    `book: ${meta.book}`,
    `chapter: ${meta.chapter}`,
    `edition: ${meta.edition}`,
    '---',
  ].join('\n');
  return `${fm}\n${body}`;
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/** Parse a chapter file back into front-matter + body. Returns null if malformed. */
export function parseReferenceChapterFile(
  raw: string,
): { meta: ReferenceChapterFrontMatter; body: string } | null {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) return null;
  const fmLines = m[1].split('\n');
  const fields: Record<string, string> = {};
  for (const line of fmLines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const book = Number(fields.book);
  const chapter = Number(fields.chapter);
  if (!fields.work || !fields.edition || !Number.isFinite(book) || !Number.isFinite(chapter)) {
    return null;
  }
  return {
    meta: { work: fields.work, book, chapter, edition: fields.edition },
    body: m[2],
  };
}

const LS_PREFIX = 'workbench:reference:';

class BrowserStorage implements ReferenceStorage {
  private key(workId: string, slug: string, file: string): string {
    return `${LS_PREFIX}${workId}/${slug}/${file}`;
  }
  async read(workId: string, slug: string, file: string): Promise<string | null> {
    return localStorage.getItem(this.key(workId, slug, file));
  }
  async write(workId: string, slug: string, file: string, content: string): Promise<void> {
    localStorage.setItem(this.key(workId, slug, file), content);
  }
  async list(workId: string, slug: string): Promise<string[]> {
    const prefix = `${LS_PREFIX}${workId}/${slug}/`;
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
    return out.sort();
  }
  async remove(workId: string, slug: string, file: string): Promise<void> {
    localStorage.removeItem(this.key(workId, slug, file));
  }
  async listEditions(workId: string): Promise<string[]> {
    const prefix = `${LS_PREFIX}${workId}/`;
    const slugs = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash > 0) slugs.add(rest.slice(0, slash));
    }
    return [...slugs].sort();
  }
  async removeEdition(workId: string, slug: string): Promise<void> {
    const files = await this.list(workId, slug);
    for (const file of files) await this.remove(workId, slug, file);
  }
}

/** Mirrors library/storage.ts's ResolvedPath: absolute custom root, or relative + baseDir default. */
interface ResolvedPath {
  path: string;
  baseDir?: import('@tauri-apps/plugin-fs').BaseDirectory;
}

let cachedRoot: string | null | undefined; // undefined = not yet resolved

async function resolveRoot(): Promise<string | null> {
  if (cachedRoot !== undefined) return cachedRoot;
  const settings = await loadSettings();
  cachedRoot = settings.referenceRoot ?? null;
  return cachedRoot;
}

/** Call after updateSettings({ referenceRoot }) so the next storage call picks it up. */
export function invalidateReferenceRootCache(): void {
  cachedRoot = undefined;
  instance = null;
}

class TauriStorage implements ReferenceStorage {
  private async fs() {
    return import('@tauri-apps/plugin-fs');
  }
  private async resolveEditionDir(workId: string, slug: string): Promise<ResolvedPath> {
    const root = await resolveRoot();
    if (root) {
      const sep = root.endsWith('/') ? '' : '/';
      return { path: `${root}${sep}${workId}/${slug}` };
    }
    const fs = await this.fs();
    return { path: `references/${workId}/${slug}`, baseDir: fs.BaseDirectory.AppData };
  }
  private async resolveWorkDir(workId: string): Promise<ResolvedPath> {
    const root = await resolveRoot();
    if (root) {
      const sep = root.endsWith('/') ? '' : '/';
      return { path: `${root}${sep}${workId}` };
    }
    const fs = await this.fs();
    return { path: `references/${workId}`, baseDir: fs.BaseDirectory.AppData };
  }
  private async resolveFile(workId: string, slug: string, file: string): Promise<ResolvedPath> {
    const dir = await this.resolveEditionDir(workId, slug);
    return { path: `${dir.path}/${file}`, baseDir: dir.baseDir };
  }
  async read(workId: string, slug: string, file: string): Promise<string | null> {
    const fs = await this.fs();
    const { path, baseDir } = await this.resolveFile(workId, slug, file);
    try {
      if (!(await fs.exists(path, { baseDir }))) return null;
      return await fs.readTextFile(path, { baseDir });
    } catch {
      return null;
    }
  }
  async write(workId: string, slug: string, file: string, content: string): Promise<void> {
    const fs = await this.fs();
    const dir = await this.resolveEditionDir(workId, slug);
    await fs.mkdir(dir.path, { baseDir: dir.baseDir, recursive: true });
    const { path, baseDir } = await this.resolveFile(workId, slug, file);
    await fs.writeTextFile(path, content, { baseDir });
  }
  async list(workId: string, slug: string): Promise<string[]> {
    const fs = await this.fs();
    const dir = await this.resolveEditionDir(workId, slug);
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
  async remove(workId: string, slug: string, file: string): Promise<void> {
    const fs = await this.fs();
    const { path, baseDir } = await this.resolveFile(workId, slug, file);
    try {
      if (await fs.exists(path, { baseDir })) await fs.remove(path, { baseDir });
    } catch {
      // best-effort; nothing to clean up if it never existed
    }
  }
  async listEditions(workId: string): Promise<string[]> {
    const fs = await this.fs();
    const dir = await this.resolveWorkDir(workId);
    try {
      const entries = await fs.readDir(dir.path, { baseDir: dir.baseDir });
      return entries
        .filter((e) => e.isDirectory)
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }
  async removeEdition(workId: string, slug: string): Promise<void> {
    const fs = await this.fs();
    const dir = await this.resolveEditionDir(workId, slug);
    try {
      if (await fs.exists(dir.path, { baseDir: dir.baseDir })) {
        await fs.remove(dir.path, { baseDir: dir.baseDir, recursive: true });
      }
    } catch {
      // best-effort
    }
  }
}

let instance: ReferenceStorage | null = null;

export function referenceStorage(): ReferenceStorage {
  if (!instance) instance = isTauri() ? new TauriStorage() : new BrowserStorage();
  return instance;
}

// ── in-memory implementation for tests ──────────────────────────────────────

/** In-memory ReferenceStorage fake for reference/** tests (no localStorage, no Tauri fs). */
export class MemReferenceStorage implements ReferenceStorage {
  files = new Map<string, string>();

  private key(workId: string, slug: string, file: string): string {
    return `${workId}/${slug}/${file}`;
  }
  async read(workId: string, slug: string, file: string): Promise<string | null> {
    return this.files.get(this.key(workId, slug, file)) ?? null;
  }
  async write(workId: string, slug: string, file: string, content: string): Promise<void> {
    this.files.set(this.key(workId, slug, file), content);
  }
  async list(workId: string, slug: string): Promise<string[]> {
    const prefix = `${workId}/${slug}/`;
    return [...this.files.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length))
      .sort();
  }
  async remove(workId: string, slug: string, file: string): Promise<void> {
    this.files.delete(this.key(workId, slug, file));
  }
  async listEditions(workId: string): Promise<string[]> {
    const prefix = `${workId}/`;
    const slugs = new Set<string>();
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash > 0) slugs.add(rest.slice(0, slash));
    }
    return [...slugs].sort();
  }
  async removeEdition(workId: string, slug: string): Promise<void> {
    const prefix = `${workId}/${slug}/`;
    for (const k of [...this.files.keys()]) {
      if (k.startsWith(prefix)) this.files.delete(k);
    }
  }
}
