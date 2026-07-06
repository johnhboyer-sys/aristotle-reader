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
  parseTranslationFile, serializeFrontmatter, splitChapters, slugId, composeCitation,
  type ParsedTranslation, type TranslationMeta, type FootnoteScope,
} from './translation-file';
import { buildChapterInputs } from './aligner/reference';
import { alignImportedChapter, emitOverlayPieces, type ChapterAlignment, type PieceEmphasis } from './aligner/import-align';

export interface ImportRecord {
  meta: TranslationMeta;
  density: string;
  warnings: string[];
  stats: { tagged: number; placed: number; interpolated: number; chapters: number };
  /** book number → segment id → overlay pieces (precomputed at import time). */
  overlaysByBook: Record<string, Record<string, RossPiece[]>>;
  /**
   * book number → Bekker COLUMN (not segment id — matches the rendered DOM's
   * `#col-{column}` element directly) → that column's overlay pieces'
   * emphasis spans (precomputed at import time, PARALLEL to overlaysByBook —
   * never stored on RossPiece itself; see import-align.ts's emitOverlayPieces
   * doc comment for why). Optional so records written before this field
   * existed still load — paintEmphasis (annotations.ts) just has nothing to
   * paint for them.
   */
  emphasisByBook?: Record<string, Record<string, PieceEmphasis[]>>;
  /** per-chapter anchor maps, kept for future refinement/re-tagging. */
  alignment: Record<string, ChapterAlignment>;
  /**
   * label -> note text (§B3), from the file's sentinel-delimited footnote
   * definitions block. Both fields optional so records written before Phase
   * 3 still load unchanged — getImportFootnote just has nothing to resolve
   * for them, mirroring emphasisByBook's read-time-optional precedent.
   */
  footnotes?: Record<string, string>;
  footnoteScope?: FootnoteScope;
  /**
   * 'b.c' -> chapter title, verbatim, from the PDF converter's title map
   * (Phase 4A's `ConvertResult.titles`; §Phase-4B task 2). Optional so
   * records from a hand-authored/plain import (no converter involved) or
   * written before this field existed still load unchanged — getImportTitles
   * just has nothing to contribute for them.
   */
  titles?: Record<string, string>;
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
  /** e.g. "Detected continuous work-level numbering — 222 footnotes." Undefined when the file has no footnotes block. */
  footnoteSummary?: string;
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
  /**
   * §B4.4: FootnotePopup.svelte (app/src, SHARED with the static site build,
   * which has no imports.ts and must not import desktop code) resolves an
   * imported translation's footnote text through this window-level hook
   * instead of a direct import — the same pattern __ARISTOTLE_BOOK_HOOK__ and
   * __ARISTOTLE_EXTRA_TRANSLATIONS__ already use above. Site build: hook is
   * never installed, so app/src's lazy `globalThis.__ARISTOTLE_...` read is
   * always undefined there — inert, byte-identical rendering.
   */
  __ARISTOTLE_IMPORT_FOOTNOTE_HOOK__?: (work: string, id: string, label: string) => string | null;
  /**
   * Companion to the hook above: lets FootnotePopup tell "this transId is a
   * registered import with no note for this label" apart from "this transId
   * isn't an import at all — fall back to the site's fetchFootnotes(work)".
   * Without this, a registered import's unmatched label would silently fall
   * through to the WORK's built-in footnotes.json and could show a foreign
   * translation's note text if the label happened to collide (both use plain
   * digit labels under continuous scope) — see implementation-notes.md.
   */
  __ARISTOTLE_IMPORT_HAS_TRANS__?: (work: string, id: string) => boolean;
};

const registered = new Map<string, ImportRecord>(); // "work/id" → record

// The built-in corpus overlays only ever surface interpolated (estimate)
// Bekker ticks at the 5-line apparatus stops plus the column-start line
// (n=1) — verified against build/dist/**/book-*.json, where every real:false
// tick has n%5===0 or n===1. Real (user/model-placed) ticks always render;
// interpolated ones are noise between those printed stops. The importer's
// engine.interpolate() fills EVERY untagged line, so without this filter an
// imported five-line-tagged file renders a tick on every single line instead
// of the sparse gutter the built-in translations show. Filtering here (at
// the overlay-merge hook, which re-reads the stored map on every book fetch)
// means already-imported translations are fixed retroactively — no re-import
// needed — since nothing is mutated in the stored record itself.
function sparseTicks(
  ticks: { n: number; offset: number; real: boolean }[],
): { n: number; offset: number; real: boolean }[] {
  const filtered = ticks.filter(t => t.real || t.n % 5 === 0 || t.n === 1);
  return filtered.length === ticks.length ? ticks : filtered;
}

function sparsifyPieces(pieces: RossPiece[]): RossPiece[] {
  return pieces.map(p => {
    if (!p.bekker) return p;
    const bekker = sparseTicks(p.bekker);
    return bekker === p.bekker ? p : { ...p, bekker };
  });
}

// Display name shown in the picker: "Translator (Year)" plus a subtle
// muted-info marker so an imported translation is distinguishable from a
// built-in one at a glance — but "imported" itself never appears in the
// name. It stays only in the stored record's metadata (greppable/debuggable
// via the map.json / localStorage entry), never in display strings, exported
// citations, or copied citations. There's no tooltip here (the picker is
// rendered by untouched site code as a plain <option> string), so the marker
// has to be minimal and self-explanatory rather than relying on a title attr.
function displayName(meta: TranslationMeta): string {
  return `${meta.translator}${meta.year ? ` (${meta.year})` : ''} ⓘ`;
}

function installHooks(): void {
  const g = globalThis as G;
  const extras: Record<string, TranslationRef[]> = {};
  for (const [key, rec] of registered) {
    const work = key.split('/')[0];
    (extras[work] ??= []).push({
      id: rec.meta.id,
      name: displayName(rec.meta),
      short: rec.meta.translator,
      slot: 'overlay',
      // §B4.2: marks this overlay for Reader.svelte's footnote-marker
      // transform (the same TranslationRef.footnotes flag a built-in like
      // Owen already sets) — only when the file actually carried a
      // footnotes block, so an import with none renders exactly as before.
      ...(rec.footnotes && Object.keys(rec.footnotes).length > 0 ? { footnotes: true } : {}),
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
          seg.overlays = { ...(seg.overlays ?? {}), [rec.meta.id]: sparsifyPieces(pieces) };
          touched = true;
        }
      }
    }
    return touched ? data : data;
  };
  // §B4.4: window-level footnote-resolution hooks for FootnotePopup.svelte
  // (site-shared; see the G type's doc comment above for why these exist as
  // hooks rather than a direct import).
  g.__ARISTOTLE_IMPORT_HAS_TRANS__ = (work, id) => registered.has(`${work}/${id}`);
  g.__ARISTOTLE_IMPORT_FOOTNOTE_HOOK__ = (work, id, label) => getImportFootnote(work, id, label);
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

/**
 * Emphasis spans for one imported translation's rendered Bekker column
 * (matches the DOM's `#col-{column}` element directly) — each entry carries
 * its own piece's full text (PieceEmphasis.pieceText) so the caller can match
 * it against the right `.ross-prose` block by CONTENT (a column can render
 * several chapter-blocks' worth of `.ross-prose`; see import-align.ts's
 * PieceEmphasis doc comment for why content-matching, not a lookup key, is
 * the robust join). Returns [] (never throws) when `id` isn't a registered
 * import, the book/column carries no emphasis, or the record predates this
 * field.
 */
export function getImportEmphasis(work: string, id: string, book: number, column: string): PieceEmphasis[] {
  const rec = registered.get(`${work}/${id}`);
  return rec?.emphasisByBook?.[String(book)]?.[column] ?? [];
}

/**
 * Pure core of getImportFootnote — resolves `label` (the full scope-qualified
 * identity: plain digits under continuous scope, "book.chapter.N" under
 * per-chapter, or a "*"/"†" work-level glyph — see phase3-final-spec.md §B5)
 * against one already-fetched record's footnotes map. Split out from the
 * `registered`-Map lookup below so it's unit-testable with a plain object
 * literal, no storage/registration pipeline required.
 */
export function resolveImportFootnote(rec: ImportRecord | undefined, label: string): string | null {
  return rec?.footnotes?.[label] ?? null;
}

/**
 * §B4 (Phase 4 wires this into FootnotePopup): the note text for one label
 * on one imported translation, reading `registered.get(...).footnotes?.[label]`
 * — mirrors getImportEmphasis. Returns null (never throws) when `work`/`id`
 * isn't a registered import, the label has no definition, or the record
 * predates the footnotes field.
 */
export function getImportFootnote(work: string, id: string, label: string): string | null {
  return resolveImportFootnote(registered.get(`${work}/${id}`), label);
}

/**
 * §Phase-4B task 2: merged 'b.c' -> title map across every registered import
 * for `work` (converter-derived titles only; records with no `titles` field
 * contribute nothing). Iterates `registered` in Map insertion order — i.e.
 * the order imports were loaded/registered this session, NOT necessarily
 * their original import chronology — and a later entry's title for the same
 * key overwrites an earlier one ("later imports win"). Consumed by
 * App.svelte via mergeChapterTitles below, which merges this OVER the
 * fetched chapter-titles.json map but only to fill gaps.
 */
export function getImportTitles(work: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, rec] of registered) {
    if (key.split('/')[0] !== work || !rec.titles) continue;
    Object.assign(out, rec.titles);
  }
  return out;
}

/**
 * §Phase-4B task 2: merge an imported 'b.c' -> title map (as returned by
 * getImportTitles) over `builtin`'s per-chapter titles for ONE book — but
 * ONLY to fill a gap. A built-in title always wins over an imported one: the
 * built-in file is curated/reviewed for this exact book, while an imported
 * title is machine-extracted from a PDF's running heads and may be noisier
 * — conservative default, never let an import silently replace a reviewed
 * title. Pure function (no registry access) so the merge rule is directly
 * unit-testable; App.svelte's mergeTitles is a thin wrapper that supplies
 * `getImportTitles(work)` as `imported`.
 */
export function mergeChapterTitles(
  book: number,
  builtin: Record<string, string>,
  imported: Record<string, string>,
): Record<string, string> {
  if (Object.keys(imported).length === 0) return builtin;
  const merged = { ...builtin };
  const prefix = `${book}.`;
  for (const [key, title] of Object.entries(imported)) {
    if (!key.startsWith(prefix)) continue;
    const chapter = key.slice(prefix.length);
    if (!merged[chapter]) merged[chapter] = title;
  }
  return merged;
}

/**
 * The citation string for an imported translation, for Copy Citation:
 * the stored `citation` verbatim, or the translator/year/source fallback
 * when a record predates the citation field (or the form was left blank).
 * Read-time defaulting — no migration needed for records already on disk.
 * Returns null when `id` isn't a registered import (i.e. it's a built-in
 * translation, which the caller cites from the site registry instead).
 */
export function getImportCitation(work: string, id: string): string | null {
  const rec = registered.get(`${work}/${id}`);
  if (!rec) return null;
  return rec.meta.citation || composeCitation(rec.meta);
}

// ── the import operation ─────────────────────────────────────────────────────

export interface ImportRequest {
  raw: string;                 // file content as uploaded (dehyphenated, but still carrying
                                // emphasis markers — parseTranslationFile classifies those)
  /**
   * The pristine upload, when it differs from `raw` — e.g. ImportDialog's
   * PDF-conversion pre-stage sets `raw` to the CONVERTER'S tagged output
   * (what actually gets parsed/aligned/canonicalized) but wants the
   * `.original` safety-net file to hold the real pdftotext extraction, not
   * the tagged text. Falls back to `raw` when omitted — every pre-existing
   * caller (a plain/hand-tagged import has no separate "original") keeps
   * today's behavior unchanged.
   */
  original?: string;
  work: string;                // corpus slug (from the dropdown — never free text)
  translator: string;
  license: TranslationMeta['license'];
  year?: number;
  source?: string;
  citation?: string;           // full bibliographic citation; falls back to
                                // composeCitation(translator/year/source) if omitted
  replace?: boolean;           // collision resolution: true = replace existing
  idOverride?: string;         // collision resolution: "keep both" imports under a new id
  /**
   * Emphasis review decisions ImportDialog's interactive queue already
   * collected (marker-review index → 'keep'/'remove'), replayed verbatim by
   * parseTranslationFile instead of its own pattern-based defaults —
   * scanEmphasis is pure, so re-scanning this same `raw` text reproduces the
   * identical review-item indices the dialog saw. Omit for a caller (tests,
   * a non-interactive re-import) that wants the defaults applied instead.
   */
  emphasisChoices?: Map<number, 'keep' | 'remove'>;
  /**
   * 'b.c' -> chapter title map from the PDF converter (Phase 4A's
   * ConvertResult.titles), passed through unchanged by ImportDialog when the
   * source file was a layout extraction. Stored on the ImportRecord verbatim
   * (§getImportTitles); omitted for a plain/hand-tagged import, which has no
   * titles to offer.
   */
  titles?: Record<string, string>;
}

// §B3 import summary: "Detected continuous work-level numbering — 222
// footnotes." Undefined (no line at all) when the file carries no footnote
// definitions — most imports don't have a footnotes block, and a summary
// with "0 footnotes" would read as an error rather than simply "not present".
const SCOPE_PHRASE: Record<FootnoteScope, string> = {
  continuous: 'Detected continuous work-level numbering',
  'per-book': 'Detected per-book numbering',
  'per-chapter': 'Detected per-chapter numbering',
};

function footnoteSummaryLine(scope: FootnoteScope, footnotes: Record<string, string>): string | undefined {
  const count = Object.keys(footnotes).length;
  if (count === 0) return undefined;
  return `${SCOPE_PHRASE[scope]} — ${count} footnote${count === 1 ? '' : 's'}.`;
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
  const parsed: ParsedTranslation = parseTranslationFile(req.raw, req.emphasisChoices);
  const meta: TranslationMeta = {
    formatVersion: 1,
    work: req.work,
    translator: req.translator,
    license: req.license,
    ...(req.year !== undefined ? { year: req.year } : {}),
    ...(req.source ? { source: req.source } : (parsed.meta.source ? { source: parsed.meta.source } : {})),
    language: parsed.meta.language ?? 'en',
    id: req.idOverride ?? parsed.meta.id ?? slugId(req.translator, req.work),
    ...(req.citation ? { citation: req.citation } : (parsed.meta.citation ? { citation: parsed.meta.citation } : {})),
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
  const emphasisByBook: Record<string, Record<string, PieceEmphasis[]>> = {};
  for (const b of books) {
    onProgress(`Aligning Book ${b} of ${workMeta.books}…`);
    const bookData = await fetchBook(req.work, b);
    const prose = new Map(
      chapters.filter(c => c.book === b).map(c => [`${c.book}:${c.chapter}`, c.text]),
    );
    const inputs = buildChapterInputs(bookData, chaptersIndex, prose);
    const perBook: ChapterAlignment[] = [];
    for (const input of inputs) {
      const ch = chapters.find(c => c.book === b && String(c.chapter) === input.chapter);
      const ca = alignImportedChapter(input, ch?.tags ?? [], parsed.density, ch?.emphasis ?? [], ch?.footnoteMarkers ?? []);
      perBook.push(ca);
      aligned.push(ca);
      alignment[`${ca.book}:${ca.chapter}`] = ca;
    }
    const emitted = emitOverlayPieces(bookData, perBook);
    overlaysByBook[String(b)] = emitted.pieces;
    emphasisByBook[String(b)] = emitted.emphasis;
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
    emphasisByBook,
    alignment,
    footnotes: parsed.footnotes,
    footnoteScope: parsed.footnoteScope,
    ...(req.titles ? { titles: req.titles } : {}),
  };
  const canonical = parsed.hasFrontmatter
    ? req.raw
    : serializeFrontmatter(meta) + req.raw;
  await s.write(req.work, meta.id, canonical, req.original ?? req.raw, record);
  registered.set(`${req.work}/${meta.id}`, record);
  installHooks();

  return {
    meta,
    density: parsed.density,
    footnoteSummary: footnoteSummaryLine(parsed.footnoteScope, parsed.footnotes),
    warnings: parsed.warnings,
    chapters: record.stats.chapters,
    tagged: record.stats.tagged,
    placed: record.stats.placed,
    interpolated: record.stats.interpolated,
    replaced: already,
  };
}
