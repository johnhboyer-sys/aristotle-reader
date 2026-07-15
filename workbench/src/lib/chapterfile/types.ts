/**
 * Types for the chapter save format — the app's canonical user data.
 * See workbench-design/d2-citation-schemes.md "Chapter-file frontmatter".
 */

import type { SchemeId } from '../citation/types';

/**
 * One `<columnRef>@<rowIndex>` pair from the frontmatter `column_starts`
 * field. `ref` is the FULL raw address (column + line) of the first row of a
 * column segment — the first pair's ref equals span_start (so it carries the
 * chapter's starting line); later pairs carry the actual first line of each
 * new column (usually 1, but never assumed). `rowIndex` is 1-based.
 */
export interface ColumnStart {
  ref: string;
  rowIndex: number;
}

/**
 * One `<address>@<offset>` pair from the frontmatter `line_splits` field
 * (design doc D6 — paragraph splits inside a Bekker line). `ref` is the
 * OPAQUE raw address of the split row — validated only via
 * `scheme.parseAddress`, never compared or ordered outside citation/.
 * `offset` is a Greek CODE-UNIT index into that row's [GREEK] line — the
 * same `.length`/`.slice` basis as everything else in this file format (see
 * `isValidSplitOffset` in parse.ts before "fixing" this to code points).
 */
export interface LineSplit {
  ref: string;
  offset: number;
}

export interface ChapterFileMeta {
  schemaVersion: number;
  work: string;
  book: number;
  chapter: number;
  citationScheme: SchemeId;
  spanStart: string;
  spanEnd: string;
  /**
   * OPTIONAL self-contained per-row addressing (frontmatter `column_starts`).
   * Absent in older files — every consumer must handle absence. When present:
   * rows `rowIndex..next.rowIndex-1` live in the segment's column, line
   * numbers incrementing by 1 per row from the segment ref's line (see
   * `rowAddress`).
   */
  columnStarts?: ColumnStart[];
  /**
   * OPTIONAL paragraph-split points (frontmatter `line_splits`), design doc
   * D6. Absent in unsplit files — every consumer must handle absence. The
   * parser checks STRUCTURE only (pair shape, scheme-parseable refs, positive
   * strictly-ascending offsets per address) and keeps the pairs verbatim so
   * serialization is byte-stable; whether an offset actually lands inside —
   * and at a word boundary of — its row's Greek is validated at HYDRATION
   * (library/autosave.ts), where a drifted split degrades to an unsplit line
   * with a notice instead of refusing the file.
   */
  lineSplits?: LineSplit[];
  /**
   * OPTIONAL visual paragraph grouping for plain-line document-spine works
   * (frontmatter `paragraph_starts`): 1-based row ordinals that begin a
   * paragraph group. Meaningful only for line-segmented corpus-free imports.
   */
  paragraphStarts?: number[];
  /**
   * OPTIONAL heading roles for document-spine works (frontmatter `headers`,
   * D8 heading tools): the rows the user has marked as a heading/section title
   * and their level. Absent = no headings. Like `paragraphStarts` this is
   * lenient display metadata; out-of-range/duplicate/junk entries degrade at
   * parse (sanitizeHeaders) instead of refusing the file.
   */
  headers?: HeaderMark[];
}

/**
 * A row's structural role in a document-spine work (D8 heading tools). Level 1
 * (`header`) is a top-level heading; level 2 (`subheader`) is a section title
 * nested under it. Absent = an ordinary content row. Headings stay TRANSLATABLE
 * (both columns keep their text); the role only changes how the row renders
 * (as a title, out of the flowing views) and lets it anchor a part boundary.
 */
export type RowHeaderLevel = 1 | 2;

/**
 * One `<rowOrdinal>:<level>` pair from the frontmatter `headers` field: the
 * 1-based row ordinal that carries a heading role and its level (1 or 2). Like
 * `paragraph_starts` this is OPTIONAL, LENIENT display metadata — a malformed
 * value degrades (see sanitizeHeaders) rather than refusing the file.
 */
export interface HeaderMark {
  row: number;
  level: RowHeaderLevel;
}

export interface Footnote {
  id: number;
  body: string;
}

export interface ChapterFile {
  meta: ChapterFileMeta;
  greekLines: string[];
  englishLines: string[];
  /** Optional paragraph-granularity translation layer, one physical line per row. */
  englishParaLines?: string[];
  footnotes: Footnote[];
  /**
   * True when frontmatter `paragraph_starts` carried entries the parser had
   * to drop or reorder (junk tokens, zero/negative, duplicates, out of
   * range). paragraph_starts is optional DISPLAY metadata, so a malformed
   * value degrades leniently instead of refusing the file (D6 drift
   * convention); hydration surfaces this flag as a one-line notice. Never
   * set by serialization-side construction — parse-only.
   */
  paragraphStartsSanitized?: boolean;
}

/** Thrown by parseChapterFile on any validation failure. Message is plain-language and line-numbered where applicable. */
export class ChapterFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChapterFileError';
  }
}
