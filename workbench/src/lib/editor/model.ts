// ChapterModel — the single source of truth for an open chapter (design doc
// D1 §"Model"). Row count is owned by the Greek spine; nothing the user does
// creates or destroys a row. Editors commit into the model (blur/idle);
// autosave will serialize FROM it (serialize.ts), never from the live views.

import type { Address, SchemeId } from '../citation/types';
import type { PMDocJSON } from './schema';
import { emptyRowDocJSON } from './schema';
import type { FixtureChapter } from '../../dev/fixture-meta-z17';

export interface RowModel {
  /** Opaque scheme-owned address; the gutter shows `address.raw` verbatim. */
  address: Address;
  /** The Greek spine line — read-only in the editor. */
  greek: string;
  /**
   * Committed English row doc (PM JSON) of SEGMENT 0. Live views may be
   * ahead until commit. On a paragraph-split line (design doc D6) the
   * continuation segments live in `english2` — use englishDocsOf/segmentCount
   * rather than poking the raw fields.
   */
  english: PMDocJSON;
  /**
   * Paragraph-granularity translation layer for document-spine paragraph
   * rows (D8 §4). Sentence-granularity translations still live in
   * `english`/`english2`; Bekker rows never use this field.
   */
  englishPara?: PMDocJSON;
  /**
   * Paragraph-split points (design doc D6): ascending Greek CODE-UNIT offsets
   * into `greek` — the same `.length`/`.slice` basis the chapter file uses
   * (see chapterfile isValidSplitOffset before "fixing" this to code points).
   * Absent/empty = unsplit (the common case). May run SHORT of `english2`
   * after a drift/skew hydration (English count wins; the extra segments have
   * no Greek anchor) — never longer than `english2`.
   */
  splitOffsets?: number[];
  /**
   * English docs of the continuation segments: segment k+1 is `english2[k]`
   * (`english` stays segment 0). Parallel to `splitOffsets` in the normal
   * case (same length); see splitOffsets for the drift exception.
   */
  english2?: PMDocJSON[];
}

/** Number of English segments of a row: 1 (unsplit) + continuations. */
export function segmentCount(row: RowModel): number {
  return 1 + (row.english2?.length ?? 0);
}

/**
 * All English segment docs of a row in DOCUMENT ORDER (segment 0 first).
 * Every walk that enumerates a row's English — serialization, marker/footnote
 * document order, counting — goes through this so later slices never poke
 * `english`/`english2` directly.
 */
export function englishDocsOf(row: RowModel): PMDocJSON[] {
  return [row.english, ...(row.english2 ?? [])];
}

/** True when the row has any sentence-layer English content. */
export function hasSentenceEnglish(row: RowModel): boolean {
  return englishDocsOf(row).some((doc) => (doc.content?.length ?? 0) > 0);
}

/** True when the row has paragraph-layer English content. */
export function hasParagraphEnglish(row: RowModel): boolean {
  return (row.englishPara?.content?.length ?? 0) > 0;
}

/** All English docs that can carry footnote markers, across both D8 layers. */
export function allEnglishDocsOf(row: RowModel): PMDocJSON[] {
  return [...englishDocsOf(row), ...(row.englishPara ? [row.englishPara] : [])];
}

export interface Footnote {
  /** Chapter-local id (build spec §3); display numbers are computed. */
  id: string;
  body: string;
  /** False once the user deletes the marker — body kept, recoverable. */
  anchored: boolean;
}

export interface ChapterModel {
  workId: string;
  workTitle: string;
  scheme: SchemeId;
  book: number;
  bookLabel: string;
  chapter: number;
  bekkerRange: string;
  rows: RowModel[];
  footnotes: Footnote[];
  /**
   * Visual paragraph grouping for plain-line document-spine works (D8 §5:
   * chapter-file `paragraph_starts`, 1-based row ordinals). Carried on the
   * model so autosave round-trips it; Phase D's views read it for grouping.
   * Hydration supplies it (modelFromFixture leaves it unset — fixtures have
   * no grouping and corpus works never carry one).
   */
  paragraphStarts?: number[];
  dirty: boolean;
}

export function modelFromFixture(fixture: FixtureChapter): ChapterModel {
  return {
    workId: fixture.workId,
    workTitle: fixture.workTitle,
    scheme: fixture.scheme,
    book: fixture.book,
    bookLabel: fixture.bookLabel,
    chapter: fixture.chapter,
    bekkerRange: fixture.bekkerRange,
    rows: fixture.lines.map((line) => ({
      address: line.address,
      greek: line.greek,
      english: emptyRowDocJSON(),
    })),
    footnotes: [],
    dirty: false,
  };
}

/** Next chapter-local footnote id: max numeric id + 1 (ids stay stable). */
export function nextFootnoteId(footnotes: Footnote[]): string {
  let max = 0;
  for (const fn of footnotes) {
    const n = Number(fn.id);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function cloneFootnotes(footnotes: Footnote[]): Footnote[] {
  return footnotes.map((fn) => ({ ...fn }));
}

/**
 * Display numbers for anchored footnotes: 1-based, in document order of their
 * markers (row order, then position within the row). Computed on demand,
 * never stored (design doc D1 §"Footnotes").
 *
 * `markerOrder` = footnote ids in document order, as collected from the rows.
 */
export function displayNumbers(markerOrder: string[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const id of markerOrder) {
    if (!map.has(id)) map.set(id, ++n);
  }
  return map;
}
