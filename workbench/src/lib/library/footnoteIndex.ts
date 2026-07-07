// Work-wide continuous footnote numbering (build spec §3/§7).
//
// Footnote numbers never restart per chapter or book: the number shown for a
// marker is
//
//   displayNumber = (sum of anchored-footnote counts of every chapter that
//                    PRECEDES this one in the work manifest's book/chapter
//                    order) + (1-based marker position within this chapter)
//
// So that this never requires re-reading every chapter file, each work keeps
// a lightweight regenerable index in library storage:
//
//   .footnote-index.json   { "schema_version": 1, "counts": { "b07c17": 3 } }
//
// Keys are the chapter-file stem (chapterFileName minus ".md"); values are the
// chapter's ANCHORED footnote count (markers present in the text — unanchored
// bodies have no display number). Chapters missing from the index count 0.
// The current chapter's entry is refreshed on the autosave ride-along
// (updateFootnoteCount below), and an in-process change event lets an open
// editor recompute its numbering when another chapter's count changes.
//
// Ordering is the MANIFEST's book order (WorkMeta.books array order), not
// file-name string order: keys are parsed numerically, the book number is
// ranked by its position in the books list (numeric fallback for books the
// manifest doesn't know), then chapters compare numerically.

import { chapterFileName } from './storage';
import type { LibraryStorage } from './storage';

export const FOOTNOTE_INDEX_FILE = '.footnote-index.json';

export interface FootnoteIndexData {
  schemaVersion: 1;
  /** chapter key ("b07c17") → anchored footnote count. */
  counts: Record<string, number>;
}

/** Book order as the manifest declares it (WorkMeta.books). */
export type BookOrder = { n: number }[] | null;

export function emptyFootnoteIndex(): FootnoteIndexData {
  return { schemaVersion: 1, counts: {} };
}

/** Chapter key = chapter file stem, e.g. (7, 17) → "b07c17". */
export function chapterKey(book: number, chapter: number): string {
  return chapterFileName(book, chapter).replace(/\.md$/, '');
}

const KEY_RE = /^b(\d+)c(\d+)$/;

/** Parse a chapter key back to numbers; null for malformed keys. */
export function parseChapterKey(key: string): { book: number; chapter: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  return { book: Number(m[1]), chapter: Number(m[2]) };
}

/**
 * Tolerant parse: the index is a regenerable cache, so a missing, corrupt or
 * future-versioned file degrades to an empty index (numbering starts at 1 and
 * self-heals as chapters save) instead of blocking the editor.
 */
export function parseFootnoteIndex(raw: string | null): FootnoteIndexData {
  if (raw === null) return emptyFootnoteIndex();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyFootnoteIndex();
  }
  if (typeof parsed !== 'object' || parsed === null) return emptyFootnoteIndex();
  const v = parsed as Record<string, unknown>;
  if (v.schema_version !== 1) return emptyFootnoteIndex();
  const counts: Record<string, number> = {};
  if (typeof v.counts === 'object' && v.counts !== null) {
    for (const [key, val] of Object.entries(v.counts as Record<string, unknown>)) {
      if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && parseChapterKey(key)) {
        counts[key] = val;
      }
    }
  }
  return { schemaVersion: 1, counts };
}

export function serializeFootnoteIndex(index: FootnoteIndexData): string {
  // Stable key order → diffable file.
  const keys = Object.keys(index.counts).sort();
  const counts: Record<string, number> = {};
  for (const k of keys) counts[k] = index.counts[k];
  return JSON.stringify({ schema_version: 1, counts }, null, 2) + '\n';
}

/**
 * Rank of a book in the work's citation order. Books the manifest knows rank
 * by their position in the books array; unknown books rank after all known
 * ones, in numeric order (each book number maps to a unique rank, so equal
 * ranks always mean the same book).
 */
function bookRank(books: BookOrder, book: number): number {
  if (books) {
    const at = books.findIndex((b) => b.n === book);
    if (at >= 0) return at;
    return books.length + book;
  }
  return book;
}

/**
 * Sum of anchored-footnote counts of every chapter preceding (book, chapter)
 * in the manifest's book/chapter order. Chapters missing from the index
 * count 0; the chapter's own entry is never included.
 */
export function precedingFootnoteCount(
  index: FootnoteIndexData,
  books: BookOrder,
  book: number,
  chapter: number,
): number {
  const rankHere = bookRank(books, book);
  let sum = 0;
  for (const [key, count] of Object.entries(index.counts)) {
    const parsed = parseChapterKey(key);
    if (!parsed) continue;
    const rank = bookRank(books, parsed.book);
    if (rank < rankHere || (rank === rankHere && parsed.chapter < chapter)) {
      sum += count;
    }
  }
  return sum;
}

// ── storage I/O ─────────────────────────────────────────────────────────────

export async function loadFootnoteIndex(storage: LibraryStorage, workId: string): Promise<FootnoteIndexData> {
  const raw = await storage.read(workId, FOOTNOTE_INDEX_FILE);
  return parseFootnoteIndex(raw);
}

// Read-modify-write updates are serialized per work so two ride-along updates
// can't interleave and drop each other's counts.
const writeChains = new Map<string, Promise<unknown>>();

function chained<T>(workId: string, task: () => Promise<T>): Promise<T> {
  const prev = writeChains.get(workId) ?? Promise.resolve();
  const next = prev.then(task, task);
  writeChains.set(workId, next.catch(() => undefined));
  return next;
}

type IndexListener = (workId: string) => void;
const listeners = new Set<IndexListener>();

/**
 * Subscribe to in-process index changes (another chapter's count updated this
 * session). Returns an unsubscribe function.
 */
export function onFootnoteIndexChange(cb: IndexListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emitChange(workId: string): void {
  for (const cb of [...listeners]) cb(workId);
}

/**
 * Set the chapter's anchored-footnote count in the work's index. Writes only
 * when the stored value actually changes; returns whether it did. Fires the
 * in-process change event on a real change so open editors can renumber.
 */
export async function updateFootnoteCount(
  storage: LibraryStorage,
  workId: string,
  book: number,
  chapter: number,
  count: number,
): Promise<boolean> {
  return chained(workId, async () => {
    const index = await loadFootnoteIndex(storage, workId);
    const key = chapterKey(book, chapter);
    const existing = index.counts[key] ?? 0;
    if (existing === count) return false;
    if (count === 0) {
      // Keep the file minimal: absent means 0.
      delete index.counts[key];
    } else {
      index.counts[key] = count;
    }
    await storage.write(workId, FOOTNOTE_INDEX_FILE, serializeFootnoteIndex(index));
    emitChange(workId);
    return true;
  });
}
