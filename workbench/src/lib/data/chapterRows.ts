/**
 * chapterRows — build the editor's rows for (work, book, chapter) by slicing
 * the Greek spine between this chapter's anchor and the next chapter's anchor
 * (or the end of the work).
 *
 * Boundary rule (decided): a Bekker line belongs to the chapter in which the
 * line STARTS. Rows run from this chapter's anchor line through the line
 * BEFORE the next chapter's anchor line; when the next chapter starts
 * mid-line (its anchor wordIndex > 0), THIS chapter keeps that whole line and
 * the next chapter begins at the following line. Implemented as one shared
 * `startIndex(entry)` (anchor line index, +1 if the entry starts mid-line) so
 * consecutive chapters are deterministic with no duplicated or dropped lines:
 * chapter K spans [startIndex(K), startIndex(K+1) - 1] in spine document
 * order.
 *
 * Document order (segments/lines as parsed) is authoritative — NOT Bekker
 * sort order: the Metaphysics Ζ.1 transposition prints 1029b3–12 before
 * 1029b1–2, and chapters/rows must follow the printed text.
 */

import type { Address } from '../citation/types';
import { getScheme } from '../citation/registry';
import type { WorkManifest } from '../works/manifest';
import type { ChapterEntry } from '../corpus/chapters';
import type { WorkCorpus } from './corpusStore';
import type { FixtureChapter } from '../../dev/fixture-meta-z17';

export interface ChapterRow {
  address: Address;
  greek: string;
}

export interface ChapterRowsResult {
  rows: ChapterRow[];
  /** Address of the first row (chapter span start). */
  spanStart: Address;
  /** Address of the last row (chapter span end). */
  spanEnd: Address;
  entry: ChapterEntry;
}

/** One spine line in document order — the atom the editor and importer share. */
export interface FlatLine {
  column: string;
  n: number;
  text: string;
}

// The flattened spine is derived work per corpus object; cache it keyed by
// the corpus identity so repeated chapter opens don't re-flatten 8k lines.
const flatCache = new WeakMap<WorkCorpus, FlatLine[]>();

/** The spine as a flat, document-order line stream (cached per corpus). The
 * importer shares this exact flattening with the editor so both see the same
 * atoms in the same order. */
export function flatLines(corpus: WorkCorpus): FlatLine[] {
  let flat = flatCache.get(corpus);
  if (!flat) {
    flat = [];
    for (const seg of corpus.spine.segments) {
      for (const line of seg.lines) {
        flat.push({ column: seg.column, n: line.n, text: line.text });
      }
    }
    flatCache.set(corpus, flat);
  }
  return flat;
}

/** Document-order index of the spine line a chapter entry anchors at, or -1.
 * Anchors come from the spine itself so the exact (column, line) match should
 * always hit; a miss is logged and degrades to "chapter unavailable". */
function anchorLineIndex(flat: FlatLine[], entry: ChapterEntry): number {
  const line = Number(entry.line);
  for (let i = 0; i < flat.length; i++) {
    if (flat[i].column === entry.column && flat[i].n === line) return i;
  }
  return -1;
}

/** First row index owned by `entry` (see boundary rule in the header). */
function startIndex(flat: FlatLine[], entry: ChapterEntry): number {
  const idx = anchorLineIndex(flat, entry);
  if (idx < 0) return -1;
  return entry.wordIndex > 0 ? idx + 1 : idx;
}

/**
 * The spine window (start/end indices into `flatLines(corpus)`, inclusive) that
 * (book, chapter) owns — the SINGLE definition of a chapter's row span, shared
 * by the editor (via `chapterRows`) and the importer (via `plan.ts`) so the
 * imported chapter's row count equals the editor's by construction. `null` when
 * the chapter isn't in this corpus or its anchors aren't in the spine (same
 * quiet-unavailable contract as `chapterRows`).
 */
export interface ChapterSpineWindow {
  /** The corpus' flat, document-order line stream (identity-cached). */
  flat: FlatLine[];
  /** First flat index the chapter owns (inclusive). */
  start: number;
  /** Last flat index the chapter owns (inclusive). */
  end: number;
  entry: ChapterEntry;
}

export function chapterSpineRows(
  corpus: WorkCorpus,
  book: number,
  chapter: number,
): ChapterSpineWindow | null {
  const chapters = corpus.chapters;
  const gidx = chapters.findIndex((c) => c.book === book && Number(c.chapter) === chapter);
  if (gidx < 0) return null;
  const entry = chapters[gidx];

  const flat = flatLines(corpus);
  const start = startIndex(flat, entry);
  if (start < 0) {
    console.warn(
      `chapterSpineRows: ${corpus.spine.work} book ${book} ch ${chapter} anchor ${entry.column}${entry.line} not in spine`,
    );
    return null;
  }

  const next = gidx + 1 < chapters.length ? chapters[gidx + 1] : null;
  let end: number; // inclusive
  if (next) {
    const nextStart = startIndex(flat, next);
    if (nextStart < 0) {
      console.warn(
        `chapterSpineRows: ${corpus.spine.work} next anchor ${next.column}${next.line} not in spine — running to work end`,
      );
      end = flat.length - 1;
    } else {
      end = nextStart - 1;
    }
  } else {
    end = flat.length - 1;
  }

  if (end < start) {
    console.warn(`chapterSpineRows: ${corpus.spine.work} book ${book} ch ${chapter} has an empty span`);
    return null;
  }

  return { flat, start, end, entry };
}

/** Chapter numbers present for a book, in spine/document order. */
export function bookChapterNumbers(corpus: WorkCorpus, book: number): number[] {
  return corpus.chapters
    .filter((c) => c.book === book)
    .map((c) => Number(c.chapter))
    .filter((n) => Number.isFinite(n));
}

/**
 * Rows for (book, chapter). Returns null when the chapter isn't in this
 * corpus or its span can't be resolved — callers show a quiet unavailable
 * state, never an error.
 */
export function chapterRows(
  work: WorkManifest,
  corpus: WorkCorpus,
  book: number,
  chapter: number,
): ChapterRowsResult | null {
  const window = chapterSpineRows(corpus, book, chapter);
  if (!window) return null;

  const { flat, start, end, entry } = window;
  const rows: ChapterRow[] = [];
  for (let i = start; i <= end; i++) {
    const line = flat[i];
    rows.push({
      address: { scheme: work.scheme, raw: `${line.column}${line.n}` },
      greek: line.text,
    });
  }

  return {
    rows,
    spanStart: rows[0].address,
    spanEnd: rows[rows.length - 1].address,
    entry,
  };
}

/**
 * The ChapterEditor's input for (work, book, chapter) — the same shape the
 * dev fixture used (ChapterEditor's pinned prop contract), now built from the
 * corpus. Null when the chapter is unavailable.
 */
export function chapterForEditor(
  work: WorkManifest,
  corpus: WorkCorpus,
  book: number,
  chapter: number,
): FixtureChapter | null {
  const result = chapterRows(work, corpus, book, chapter);
  if (!result) return null;
  const scheme = getScheme(work.scheme);
  return {
    workId: work.id,
    workTitle: work.title,
    author: work.author,
    scheme: work.scheme,
    book,
    bookLabel: scheme.bookLabel(book, work),
    chapter,
    bekkerRange: scheme.formatRange({
      scheme: work.scheme,
      start: result.spanStart,
      end: result.spanEnd,
    }),
    lines: result.rows.map((row) => ({ address: row.address, greek: row.greek })),
  };
}
