import type { InlineTag } from './translation-file';
import type { ResolvedWorkStructure } from './import-presets';

export interface DivisionGap {
  book: number;
  chapter: number;
}

export interface DivisionAuditResult {
  booksCovered: number[];
  bookLabels: string[];
  booksFound: number;
  booksExpected: number;
  chaptersFound: number;
  chaptersExpected: number;
  chapterKeysFound: Record<number, number[]>;
  gaps: DivisionGap[];
}

/** R6 only. Call R4 first; this audit does not replace its hard rejections. */
export function auditDivisionCoverage(
  tags: InlineTag[],
  structure: ResolvedWorkStructure,
  booksCovered: readonly number[],
): DivisionAuditResult {
  const covered = [...new Set(booksCovered)].sort((a, b) => a - b);
  if (covered.length === 0) {
    throw new Error('Choose at least one book covered by this file before importing.');
  }
  for (const book of covered) {
    if (!Number.isInteger(book) || book < 1 || book > structure.books) {
      throw new Error(`Declared book ${book} is out of range for ${structure.workTitle}.`);
    }
  }

  const coveredSet = new Set(covered);
  const foundSets = new Map<number, Set<number>>();
  const chapterKeysFound: Record<number, number[]> = {};
  for (const book of covered) {
    foundSets.set(book, new Set());
    chapterKeysFound[book] = [];
  }
  for (const tag of tags) {
    if (tag.kind !== 'chapter' || !tag.book || !tag.chapter || !coveredSet.has(tag.book)) continue;
    const seen = foundSets.get(tag.book)!;
    if (!seen.has(tag.chapter)) {
      seen.add(tag.chapter);
      chapterKeysFound[tag.book].push(tag.chapter);
    }
  }

  const gaps: DivisionGap[] = [];
  let chaptersExpected = 0;
  let chaptersFound = 0;
  let booksFound = 0;
  for (const book of covered) {
    const expected = structure.chapterKeysByBook[book];
    if (!expected?.length) {
      throw new Error(`Cannot audit ${structure.workTitle}: no chapter structure is available for book ${book}.`);
    }
    chaptersExpected += expected.length;
    chaptersFound += chapterKeysFound[book].length;
    if (chapterKeysFound[book].length > 0) booksFound += 1;
    const found = foundSets.get(book)!;
    for (const chapter of expected) {
      if (!found.has(chapter)) gaps.push({ book, chapter });
    }
  }

  return {
    booksCovered: covered,
    bookLabels: [...structure.bookLabels],
    booksFound,
    booksExpected: covered.length,
    chaptersFound,
    chaptersExpected,
    chapterKeysFound,
    gaps,
  };
}

export function divisionGapLabel(gap: DivisionGap, audit: DivisionAuditResult): string {
  const label = audit.bookLabels?.[gap.book - 1];
  const bookName = label && label !== String(gap.book)
    ? `book ${gap.book} (printed ${label})`
    : `book ${gap.book}`;
  return `{${gap.book}.${gap.chapter}} — ${bookName}`;
}

export function divisionAuditLine(audit: DivisionAuditResult): string {
  const mismatch = audit.gaps.length;
  return `Division audit: ${audit.booksFound} of ${audit.booksExpected} books and `
    + `${audit.chaptersFound} of ${audit.chaptersExpected} chapters found; `
    + `${mismatch} missing chapter${mismatch === 1 ? '' : 's'}.`;
}
