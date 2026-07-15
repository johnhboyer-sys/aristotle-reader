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

/** Plain text (no markup) of a JSON doc, empty on any failure. */
function plainText(doc: RowModel['english'] | undefined): string {
  if (!doc) return '';
  try {
    return docFromJSON(doc).textContent.trim();
  } catch {
    return '';
  }
}

/**
 * A heading's translation text. A paragraph-unit doc (e.g. the Summa) commits
 * translations to the PARAGRAPH layer (englishPara); a line/sentence doc to the
 * sentence layer (english). Prefer whichever layer carries text so the rail
 * label populates regardless of the work's granularity.
 */
function englishText(row: RowModel): string {
  return plainText(row.englishPara) || plainText(row.english);
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
