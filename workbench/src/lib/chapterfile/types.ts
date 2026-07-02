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
}

export interface Footnote {
  id: number;
  body: string;
}

export interface ChapterFile {
  meta: ChapterFileMeta;
  greekLines: string[];
  englishLines: string[];
  footnotes: Footnote[];
}

/** Thrown by parseChapterFile on any validation failure. Message is plain-language and line-numbered where applicable. */
export class ChapterFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChapterFileError';
  }
}
