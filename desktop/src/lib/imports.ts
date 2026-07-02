// Imported-translation manager: storage, startup registration, and the two
// runtime hooks that make an import visible to the untouched site components —
// __ARISTOTLE_EXTRA_TRANSLATIONS__ (the Reader's picker, via works.ts) and
// __ARISTOTLE_BOOK_HOOK__ (overlay pieces merged into fetched book data).
//
// Storage is plain files in the app-data directory (no database, by design):
//   translations/<workId>/<id>.md         frontmatter + tagged content
//   translations/<workId>/<id>.map.json   alignment map + emitted overlay pieces
//   translations/<workId>/<id>.original   the untouched raw upload (safety net)
// A user's data folder is just files — backupable, movable, inspectable.
//
// In the browser dev harness (no Tauri), the same records live in
// localStorage so the whole flow is testable in a plain browser.

import { fetchBook, fetchChapters, type BookData, type RossPiece } from '../../../app/src/lib/data';
import type { TranslationRef } from '../../../app/src/lib/works';
import { getWork } from '../../../app/src/lib/works';
import { isTauri } from './runtime';
import {
  parseTranslationFile, serializeFrontmatter, splitChapters, slugId,
  type ParsedTranslation, type TranslationMeta,
} from './translation-file';
import { buildChapterInputs } from './aligner/reference';
import { alignImportedChapter, emitOverlayPieces, type ChapterAlignment } from './aligner/import-align';

export interface ImportRecord {
  meta: TranslationMeta;
  density: string;
  warnings: string[];
  stats: { tagged: number; placed: number; interpolated: number; chapters: number };
  /** book number → segment id → overlay pieces (precomputed at import time). */
  overlaysByBook: Record<string, Record<string, RossPiece[]>>;
  /** per-chapter anchor maps, kept for future refinement/re-tagging. */
  alignment: Record<string, ChapterAlignment>;
}

export interface ImportSummary {
  meta: TranslationMeta;
  density: string;
  warnings: string[];
  chapters: number;
  tagged: number;
  placed: number;
  interpolated: number;
  replaced: boolean;
}

// ── storage backends ─────────────────────────────────────────────────────────

interface Store {
  list(): Promise<{ work: string; id: string }[]>;
  readMap(work: string, id: string): Promise<ImportRecord | null>;
  write(work: string, id: string, content: string, original: string, record: ImportRecord): Promise<void>;
  exists(work: string, id: string): Promise<boolean>;
}

const LS_PREFIX = 'import-map:';

const browserStore: Store = {
  async list() {
    const out: { work: string; id: string }[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(LS_PREFIX)) {
        const [work, id] = k.slice(LS_PREFIX.length).split('/');
        out.push({ work, id });
      }
    }
    return out;
  },
  async readMap(work, id) {
    const raw = localStorage.getItem(`${LS_PREFIX}${work}/${id}`);
    return raw ? JSON.parse(raw) : null;
  },
  async write(work, id, _content, _original, record) {
    // Browser harness keeps only the map (localStorage is too small for full
    // texts alongside); the packaged app persists all three files.
    localStorage.setItem(`${LS_PREFIX}${work}/${id}`, JSON.stringify(record));
  },
  async exists(work, id) {
    return localStorage.getItem(`${LS_PREFIX}${work}/${id}`) !== null;
  },
};

async function tauriStore(): Promise<Store> {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const fs = await import('@tauri-apps/plugin-fs');
  const root = await join(await appDataDir(), 'translations');
  const dirOf = (work: string) => join(root, work);
  return {
    async list() {
      const out: { work: string; id: string }[] = [];
      if (!(await fs.exists(root))) return out;
      for (const workDir of await fs.readDir(root)) {
        if (!workDir.isDirectory) continue;
        const entries = await fs.readDir(await join(root, workDir.name));
        for (const e of entries) {
          if (e.name.endsWith('.map.json')) {
            out.push({ work: workDir.name, id: e.name.replace(/\.map\.json$/, '') });
          }
        }
      }
      return out;
    },
    async readMap(work, id) {
      try {
        const p = await join(await dirOf(work), `${id}.map.json`);
        return JSON.parse(await fs.readTextFile(p));
      } catch { return null; }
    },
    async write(work, id, content, original, record) {
      const dir = await dirOf(work);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeTextFile(await join(dir, `${id}.md`), content);
      await fs.writeTextFile(await join(dir, `${id}.original`), original);
      await fs.writeTextFile(await join(dir, `${id}.map.json`), JSON.stringify(record));
    },
    async exists(work, id) {
      return fs.exists(await join(await dirOf(work), `${id}.map.json`));
    },
  };
}

let _store: Promise<Store> | null = null;
function store(): Promise<Store> {
  if (!_store) _store = isTauri() ? tauriStore() : Promise.resolve(browserStore);
  return _store;
}

// ── runtime registration ─────────────────────────────────────────────────────

type G = typeof globalThis & {
  __ARISTOTLE_EXTRA_TRANSLATIONS__?: Record<string, TranslationRef[]>;
  __ARISTOTLE_BOOK_HOOK__?: (work: string, n: number, data: BookData) => BookData;
};

const registered = new Map<string, ImportRecord>(); // "work/id" → record

function installHooks(): void {
  const g = globalThis as G;
  const extras: Record<string, TranslationRef[]> = {};
  for (const [key, rec] of registered) {
    const work = key.split('/')[0];
    (extras[work] ??= []).push({
      id: rec.meta.id,
      name: `${rec.meta.translator}${rec.meta.year ? ` (${rec.meta.year})` : ''} — imported`,
      short: rec.meta.translator,
      slot: 'overlay',
    });
  }
  g.__ARISTOTLE_EXTRA_TRANSLATIONS__ = extras;
  g.__ARISTOTLE_BOOK_HOOK__ = (work, n, data) => {
    let touched = false;
    for (const [key, rec] of registered) {
      if (key.split('/')[0] !== work) continue;
      const perSeg = rec.overlaysByBook[String(n)];
      if (!perSeg) continue;
      for (const seg of data.segments) {
        const pieces = perSeg[seg.id];
        if (pieces) {
          seg.overlays = { ...(seg.overlays ?? {}), [rec.meta.id]: pieces };
          touched = true;
        }
      }
    }
    return touched ? data : data;
  };
}

/** Load every stored import and register it — call once at startup, before mount. */
export async function loadImports(): Promise<number> {
  const s = await store();
  for (const { work, id } of await s.list()) {
    const rec = await s.readMap(work, id);
    if (rec) registered.set(`${work}/${id}`, rec);
  }
  installHooks();
  return registered.size;
}

// ── the import operation ─────────────────────────────────────────────────────

export interface ImportRequest {
  raw: string;                 // file content as uploaded
  work: string;                // corpus slug (from the dropdown — never free text)
  translator: string;
  license: TranslationMeta['license'];
  year?: number;
  replace?: boolean;           // collision resolution: true = replace existing
}

export class ImportCollision extends Error {
  constructor(public work: string, public id: string) {
    super(`translation ${id} already exists for ${work}`);
  }
}

export async function runImport(
  req: ImportRequest,
  onProgress: (msg: string) => void = () => {},
): Promise<ImportSummary> {
  const workMeta = getWork(req.work);
  if (!workMeta) throw new Error(`unknown work: ${req.work}`);

  onProgress('Scanning tags…');
  const parsed: ParsedTranslation = parseTranslationFile(req.raw);
  const meta: TranslationMeta = {
    formatVersion: 1,
    work: req.work,
    translator: req.translator,
    license: req.license,
    ...(req.year !== undefined ? { year: req.year } : {}),
    language: parsed.meta.language ?? 'en',
    id: parsed.meta.id ?? slugId(req.translator, req.work),
  };

  const s = await store();
  const already = await s.exists(req.work, meta.id);
  if (already && !req.replace) throw new ImportCollision(req.work, meta.id);

  if (parsed.density === 'none') {
    throw new Error(
      'No {book.chapter} tags found. The importer needs at least chapter tags '
      + '(e.g. {1.7} before the first word of Book 1 chapter 7) to know where '
      + 'chapters begin — it will not guess chapter boundaries.',
    );
  }

  const { chapters } = splitChapters(parsed);
  if (!chapters.length) throw new Error('No chapters found after the tag scan.');

  // Per-book alignment: fetch each involved book's data once.
  const chaptersIndex = await fetchChapters(req.work);
  const books = [...new Set(chapters.map(c => c.book))].sort((a, b) => a - b);
  const aligned: ChapterAlignment[] = [];
  const alignment: Record<string, ChapterAlignment> = {};
  const overlaysByBook: Record<string, Record<string, RossPiece[]>> = {};
  for (const b of books) {
    onProgress(`Aligning Book ${b} of ${workMeta.books}…`);
    const bookData = await fetchBook(req.work, b);
    const prose = new Map(
      chapters.filter(c => c.book === b).map(c => [`${c.book}:${c.chapter}`, c.text]),
    );
    const inputs = buildChapterInputs(bookData, chaptersIndex, prose);
    const perBook: ChapterAlignment[] = [];
    for (const input of inputs) {
      const tags = chapters.find(c => c.book === b && String(c.chapter) === input.chapter)?.tags ?? [];
      const ca = alignImportedChapter(input, tags, parsed.density);
      perBook.push(ca);
      aligned.push(ca);
      alignment[`${ca.book}:${ca.chapter}`] = ca;
    }
    overlaysByBook[String(b)] = emitOverlayPieces(bookData, perBook);
  }

  onProgress('Writing library files…');
  const record: ImportRecord = {
    meta,
    density: parsed.density,
    warnings: parsed.warnings,
    stats: {
      tagged: aligned.reduce((n, c) => n + c.stats.tagged, 0),
      placed: aligned.reduce((n, c) => n + c.stats.placed, 0),
      interpolated: aligned.reduce((n, c) => n + c.stats.interpolated, 0),
      chapters: aligned.length,
    },
    overlaysByBook,
    alignment,
  };
  const canonical = parsed.hasFrontmatter
    ? req.raw
    : serializeFrontmatter(meta) + req.raw;
  await s.write(req.work, meta.id, canonical, req.raw, record);
  registered.set(`${req.work}/${meta.id}`, record);
  installHooks();

  return {
    meta,
    density: parsed.density,
    warnings: parsed.warnings,
    chapters: record.stats.chapters,
    tagged: record.stats.tagged,
    placed: record.stats.placed,
    interpolated: record.stats.interpolated,
    replaced: already,
  };
}
