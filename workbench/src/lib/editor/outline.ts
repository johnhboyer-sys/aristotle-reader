/**
 * Heading outline for document-spine works (D8 heading tools): the rail's
 * table-of-contents of the heading rows, LABELED BY THEIR TRANSLATION. Pure
 * derivation from the model rows so it is unit-testable and callers can
 * recompute it whenever heading levels change or a heading's English commits.
 */

import type { RowModel } from './model';
import { docFromJSON } from './schema';

export interface OutlineItem {
  /** 1-based? No — the MODEL row index (0-based), matching model.rows. */
  rowIndex: number;
  /** 1-based heading level (rank into the work's profile); 1 = top tier. */
  level: number;
  /** Translation of the heading if present, else the original-language text. */
  label: string;
}

/** Plain text (no markup) of a row's committed English segment 0. */
function englishText(row: RowModel): string {
  try {
    return docFromJSON(row.english).textContent.trim();
  } catch {
    return '';
  }
}

/**
 * Build the outline: one entry per heading row, in document order. The label is
 * the row's English translation, falling back to the original-language text so
 * an untranslated heading is never blank.
 */
export function buildOutline(rows: RowModel[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  rows.forEach((row, i) => {
    if (!row.headingLevel) return;
    const en = englishText(row);
    const label = en.length > 0 ? en : row.greek.trim();
    items.push({ rowIndex: i, level: row.headingLevel, label });
  });
  return items;
}
