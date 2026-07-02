// Autosave — ChapterModel ⇄ chapter file (design docs D1 §Model + D2
// §Chapter-file frontmatter). This is user-data persistence: correctness over
// speed, and nothing the user typed may ever be silently lost.
//
// Save path:  ChapterModel → ChapterFile → chapter-file string, written via
// libraryStorage().write(workId, chapterFileName(book, chapter), content).
// Frontmatter carries schema_version 1 + work/book/chapter/citation_scheme +
// span_start/span_end (raw address strings) + column_starts (self-contained
// per-row addressing computed from the model's real row addresses; omitted
// when the addresses can't be represented exactly — see
// columnStartsFromModel); [GREEK] is the model's greek lines verbatim;
// [ENGLISH] is serialize.ts row markup per row; [FOOTNOTES] is chapter-local
// `id: body-markup` entries (ALL footnotes, anchored or not — an unanchored
// body is recoverable user data, dropping it would be loss).
//
// Load path: on chapter open, read + parse the file if present; the FILE is
// canonical — its Greek wins over the corpus spine (quiet notice when they
// differ). English rows hydrate through the serialize.ts parser; footnote
// anchored-ness is derived from marker presence in the hydrated rows.
//
// Scheduling: every model commit calls markDirty() (debounced ~1s); chapter
// switch / window blur / visibilitychange→hidden call flush(). Writes are
// single-flight per controller and registered in a module-level pending-write
// table so re-opening a chapter can await an in-flight write before reading
// (leave Ζ.17 → instantly reopen Ζ.17 must never read a stale file).

import type { Address, SchemeId } from '../citation/types';
import type { ChapterModel, Footnote as ModelFootnote, RowModel } from '../editor/model';
import { docFromJSON, markerIdsIn } from '../editor/schema';
import { serializeRow, parseRow } from '../editor/serialize';
import { parseChapterFile, serializeChapterFile, ChapterFileError } from '../chapterfile';
import type { ChapterFile, ColumnStart } from '../chapterfile';
import { libraryStorage } from './storage';
import type { LibraryStorage } from './storage';

// ── model → file ────────────────────────────────────────────────────────────

export interface ChapterSpans {
  start: string;
  end: string;
}

/** span_start/span_end from the model's row addresses (first/last row). */
export function spansFromModel(model: ChapterModel): ChapterSpans {
  const first = model.rows[0]?.address.raw ?? '';
  const last = model.rows[model.rows.length - 1]?.address.raw ?? '';
  return { start: first, end: last };
}

/**
 * Presentation-level split of a raw address string: trailing digits = line,
 * prefix = column ("1041a6" → column "1041a", line 6). This is textual
 * slicing of the shape the whole app already treats raws as having — NOT
 * citation math (citation/'s parsed structs stay private to citation/).
 * Returns null for raws without a digit suffix (e.g. the '' addresses that
 * hydration assigns to rows beyond the corpus spine).
 */
export function splitRaw(raw: string): { column: string; line: number } | null {
  const m = /^(.*\D)(\d+)$/.exec(raw);
  if (m === null) return null;
  return { column: m[1], line: Number(m[2]) };
}

/**
 * frontmatter column_starts from the model's REAL row addresses: the first
 * row's full address @1, plus the full address of each row whose column part
 * differs from the previous row's. Returns undefined — save the file WITHOUT
 * column_starts, which every consumer must handle — whenever the pairs could
 * not reproduce every row address exactly:
 *   - no rows;
 *   - a row address that doesn't split (raw '' on spine-count drift);
 *   - rows[0] differing from the span actually written (span drift — the
 *     parser requires first ref === span_start);
 *   - line numbers not incrementing by 1 per row within a column segment.
 * When it does return pairs, rowAddress(meta, i+1) === rows[i].address.raw
 * for every row — checked here, so a written column_starts is exact by
 * construction.
 */
export function columnStartsFromModel(model: ChapterModel, spans: ChapterSpans = spansFromModel(model)): ColumnStart[] | undefined {
  if (model.rows.length === 0) return undefined;
  if (model.rows[0].address.raw !== spans.start) return undefined;

  const parts: { column: string; line: number }[] = [];
  for (const row of model.rows) {
    const split = splitRaw(row.address.raw);
    if (split === null) return undefined;
    parts.push(split);
  }

  const starts: ColumnStart[] = [{ ref: model.rows[0].address.raw, rowIndex: 1 }];
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].column !== parts[i - 1].column) {
      starts.push({ ref: model.rows[i].address.raw, rowIndex: i + 1 });
    }
  }

  // Exactness check: segment arithmetic must reproduce every row address.
  let seg = 0;
  let segLine = parts[0].line;
  for (let i = 0; i < parts.length; i++) {
    if (seg + 1 < starts.length && starts[seg + 1].rowIndex === i + 1) {
      seg += 1;
      segLine = parts[i].line;
    }
    const expected = `${parts[starts[seg].rowIndex - 1].column}${segLine + (i + 1 - starts[seg].rowIndex)}`;
    if (expected !== model.rows[i].address.raw) return undefined;
  }
  return starts;
}

export function chapterFileFromModel(model: ChapterModel, spans: ChapterSpans = spansFromModel(model)): ChapterFile {
  const footnotes = [...model.footnotes]
    .map((fn) => {
      const id = Number(fn.id);
      if (!Number.isInteger(id) || id <= 0) {
        // Should be unreachable (ids come from nextFootnoteId); fail loudly
        // rather than write a file the parser will reject.
        throw new Error(`autosave: footnote id ${JSON.stringify(fn.id)} is not a positive integer`);
      }
      return { id, body: fn.body };
    })
    .sort((a, b) => a.id - b.id);

  const columnStarts = columnStartsFromModel(model, spans);

  return {
    meta: {
      schemaVersion: 1,
      work: model.workId,
      book: model.book,
      chapter: model.chapter,
      citationScheme: model.scheme,
      spanStart: spans.start,
      spanEnd: spans.end,
      // Key order and present/absent-ness must match parseChapterFile's meta
      // construction — the round-trip self-check compares JSON shapes.
      ...(columnStarts ? { columnStarts } : {}),
    },
    greekLines: model.rows.map((r) => r.greek),
    englishLines: model.rows.map((r) => serializeRow(docFromJSON(r.english))),
    footnotes,
  };
}

/**
 * Serialize the model to the chapter-file string (the save payload), with a
 * round-trip self-check: the string is parsed back and compared before it is
 * ever handed to storage. On mismatch this THROWS — the autosave controller
 * keeps the model dirty and the last good file untouched, so a formatting
 * edge can delay a save but can never corrupt one.
 *
 * Emission goes through chapterfile's serializeChapterFile, which now emits
 * the structural blank line between sections in the exact shape
 * parseChapterFile expects (the former private emitter here existed only to
 * paper over that gap; trailing empty [ENGLISH] rows round-trip by
 * construction). The self-check stays regardless — it is the last line of
 * defense for user data.
 */
export function serializeModel(model: ChapterModel, spans?: ChapterSpans): string {
  const doc = chapterFileFromModel(model, spans);
  const content = serializeChapterFile(doc);
  const back = parseChapterFile(content, 'autosave-selfcheck');
  const shape = (d: ChapterFile) => JSON.stringify([d.meta, d.greekLines, d.englishLines, d.footnotes]);
  if (shape(back) !== shape(doc)) {
    throw new Error('autosave: serialized chapter file does not round-trip through the parser — save aborted, nothing written');
  }
  return content;
}

/** Distinct anchored-marker count across the model's rows (index ride-along). */
export function anchoredFootnoteCount(model: ChapterModel): number {
  const ids = new Set<string>();
  for (const row of model.rows) {
    for (const id of markerIdsIn(docFromJSON(row.english))) ids.add(id);
  }
  return ids.size;
}

// ── file → model (hydration) ────────────────────────────────────────────────

export interface SpineRow {
  address: Address;
  greek: string;
}

export interface HydrationResult {
  rows: RowModel[];
  footnotes: ModelFootnote[];
  /** Spans subsequent saves should carry (row addresses; file meta on row-count drift). */
  spans: ChapterSpans;
  /** Quiet one-line notice when the file disagrees with the corpus spine. */
  notice: string | null;
}

/**
 * Hydrate a parsed chapter file against the incoming corpus spine. The file
 * is canonical: its Greek (and, on drift, even its row count) wins — the
 * corpus supplies row ADDRESSES where the counts line up.
 */
export function hydrateFromFile(file: ChapterFile, spine: SpineRow[], scheme: SchemeId): HydrationResult {
  const fileCount = file.greekLines.length;
  const rows: RowModel[] = [];
  for (let i = 0; i < fileCount; i++) {
    rows.push({
      address: i < spine.length ? spine[i].address : { scheme, raw: '' },
      greek: file.greekLines[i],
      english: parseRow(file.englishLines[i]).toJSON(),
    });
  }

  // Anchored-ness is derived: a footnote is anchored iff its marker survives
  // somewhere in the hydrated rows.
  const markerIds = new Set<string>();
  const markerOrder: string[] = [];
  for (const row of rows) {
    for (const id of markerIdsIn(docFromJSON(row.english))) {
      if (!markerIds.has(id)) markerOrder.push(id);
      markerIds.add(id);
    }
  }
  const footnotes: ModelFootnote[] = file.footnotes.map((fn) => ({
    id: String(fn.id),
    body: fn.body,
    anchored: markerIds.has(String(fn.id)),
  }));
  // Markers with no [FOOTNOTES] entry (hand-edited file): keep them working
  // with an empty body rather than dropping the anchor.
  const known = new Set(footnotes.map((f) => f.id));
  for (const id of markerOrder) {
    if (!known.has(id)) footnotes.push({ id, body: '', anchored: true });
  }

  let notice: string | null = null;
  if (fileCount !== spine.length) {
    notice = `Saved file has ${fileCount} lines but the corpus spine has ${spine.length} — using the saved file.`;
  } else if (rows.some((row, i) => row.greek !== spine[i].greek)) {
    notice = 'Saved Greek differs from the corpus text — using the saved file.';
  }

  const spans: ChapterSpans =
    fileCount === spine.length && fileCount > 0
      ? { start: rows[0].address.raw, end: rows[fileCount - 1].address.raw }
      : { start: file.meta.spanStart, end: file.meta.spanEnd };

  return { rows, footnotes, spans, notice };
}

// ── pending-write registry (cross-controller read safety) ───────────────────

const pendingWrites = new Map<string, Promise<unknown>>();

function writeKey(workId: string, fileName: string): string {
  return `${workId}/${fileName}`;
}

/** Await any in-flight write for this file (errors are the writer's problem). */
export async function awaitPendingWrite(workId: string, fileName: string): Promise<void> {
  const pending = pendingWrites.get(writeKey(workId, fileName));
  if (pending) await pending.catch(() => undefined);
}

// ── load ────────────────────────────────────────────────────────────────────

export interface LoadResult {
  /** Parsed file, or null when none exists (fresh chapter). */
  file: ChapterFile | null;
  /**
   * Non-null when a file EXISTS but could not be parsed. The caller must not
   * autosave over it — overwriting an unreadable file could destroy the very
   * data that made it unreadable.
   */
  error: string | null;
}

export async function loadChapterFile(
  storage: LibraryStorage,
  workId: string,
  fileName: string,
): Promise<LoadResult> {
  await awaitPendingWrite(workId, fileName);
  const raw = await storage.read(workId, fileName);
  if (raw === null) return { file: null, error: null };
  try {
    return { file: parseChapterFile(raw, fileName), error: null };
  } catch (err) {
    const message = err instanceof ChapterFileError ? err.message : String(err);
    return { file: null, error: message };
  }
}

// ── the debounced controller ────────────────────────────────────────────────

export const AUTOSAVE_DEBOUNCE_MS = 1000;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveConfig {
  workId: string;
  fileName: string;
  /** Serialize the CURRENT model state; called at write time, never cached. */
  snapshot(): string;
  storage?: LibraryStorage;
  debounceMs?: number;
  onState?(state: SaveState): void;
  /** Fires after each successful write (footnote-index ride-along hooks here). */
  onSaved?(): void;
}

export interface AutosaveHandle {
  /** Schedule a debounced save (call on every model commit). */
  markDirty(): void;
  /** Save NOW if there are unsaved changes; resolves when storage settles. */
  flush(): Promise<void>;
  /** Flush and stop; further markDirty calls are ignored. */
  dispose(): Promise<void>;
  readonly state: SaveState;
}

export function createAutosave(config: AutosaveConfig): AutosaveHandle {
  const storage = config.storage ?? libraryStorage();
  const debounceMs = config.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const key = writeKey(config.workId, config.fileName);

  let dirty = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: SaveState = 'idle';
  let writing: Promise<void> | null = null;

  function setState(next: SaveState) {
    if (state === next) return;
    state = next;
    config.onState?.(next);
  }

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function writeLoop(): Promise<void> {
    // Loop: if markDirty lands while a write is in flight, write again so the
    // final file always reflects the final model state.
    while (dirty) {
      dirty = false;
      let content: string;
      try {
        content = config.snapshot();
      } catch (err) {
        // Serialization failure: keep the dirty flag so nothing is dropped,
        // surface the error state, and leave the last good file untouched.
        dirty = true;
        setState('error');
        console.error(`autosave: snapshot failed for ${key}`, err);
        return;
      }
      setState('saving');
      try {
        await storage.write(config.workId, config.fileName, content);
      } catch (err) {
        dirty = true;
        setState('error');
        console.error(`autosave: write failed for ${key}`, err);
        return;
      }
      if (!dirty) {
        setState('saved');
        config.onSaved?.();
      }
    }
  }

  function startWrite(): Promise<void> {
    if (writing) return writing;
    const run = writeLoop().finally(() => {
      writing = null;
      if (pendingWrites.get(key) === registered) pendingWrites.delete(key);
    });
    writing = run;
    const registered = run;
    pendingWrites.set(key, registered);
    return run;
  }

  return {
    get state() {
      return state;
    },
    markDirty() {
      if (disposed) return;
      dirty = true;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        void startWrite();
      }, debounceMs);
    },
    async flush() {
      clearTimer();
      // Await the in-flight write too: its loop already picks up the latest
      // dirty flag, so when it settles the file is current.
      if (dirty || writing) await startWrite();
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      clearTimer();
      if (dirty || writing) await startWrite();
    },
  };
}
