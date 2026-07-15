/**
 * Heading outline for document-spine works (D8 heading tools): the rail's
 * table-of-contents of the header/subheader rows, LABELED BY THEIR TRANSLATION.
 * Pure derivation from the model rows so it is unit-testable and callers can
 * recompute it whenever roles change or a heading's English commits.
 */

import type { RowModel } from './model';
import { docFromJSON } from './schema';

export interface OutlineItem {
  /** 1-based? No — the MODEL row index (0-based), matching model.rows. */
  rowIndex: number;
  /** 1 = header (top level), 2 = subheader (section title). */
  level: 1 | 2;
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
 * Build the outline: one entry per role row, in document order. The label is
 * the row's English translation, falling back to the original-language text so
 * an untranslated heading is never blank.
 */
export function buildOutline(rows: RowModel[]): OutlineItem[] {
  const items: OutlineItem[] = [];
  rows.forEach((row, i) => {
    if (!row.role) return;
    const en = englishText(row);
    const label = en.length > 0 ? en : row.greek.trim();
    items.push({ rowIndex: i, level: row.role === 'header' ? 1 : 2, label });
  });
  return items;
}
