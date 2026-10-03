/**
 * Books and chapters read off an imported text's own citation tiers.
 *
 * A source that cites Book › chapter › section › line (Theophrastus' Historia
 * plantarum, Xenophon's Anabasis) already says where every book and chapter
 * begins: the address changes there. Without this the import arrives as one
 * undivided document of ten thousand rows with nothing in the rail to click.
 *
 * The rule, which John approved on 2026-10-02 from before/after previews:
 *   - a tier named book, volume, play or liber is the Books;
 *   - the tier under it is the chapters, or with no book tier, the outermost;
 *   - a page, folio or column tier is never a division — it is a reference
 *     grid laid over the text (Bekker works take their chapters from the
 *     divisions table, works/divisions.ts);
 *   - the innermost tier is the line, and stays in the gutter.
 *
 * Like works/divisions.ts this lays down boundaries, never marks: no row moves
 * and no line of text becomes a title — except the first title row a book
 * prints, which IS a title and is what the Book hangs on in the rail.
 */

import type { HeaderMark } from '../chapterfile';
import type { BookContainer } from './bookContainers';
import type { ChapterContainer } from './chapterContainers';
import { normalizeChapterContainers } from './chapterContainers';

/** Tier names that make Books. */
const BOOK_TIER = /^(book|volume|play|liber)/i;

/** Tier names that are reference grids, not divisions of the text. */
const GRID_TIER = /page|folio|column/i;

/** A title in Diogenes' convention, "t" or "8t" (a title at line 8). */
const TITLE = /^\d*t$/;

export interface CitationDivisions {
  /** Every outline root: the headers passed in, plus each book's first title row. */
  headers: HeaderMark[];
  books: BookContainer[];
  chapters: ChapterContainer[];
}

const capitalised = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/**
 * `refs` are the rows' addresses in file order, `levelNames` the tiers
 * outermost first, and `headers` the title rows already marked (a line
 * numbered "t"). Returns no Books unless every book begins at a title row —
 * a Book is a boundary over outline roots, and one laid on the wrong root
 * would mis-file its chapters. The chapter labels then carry the book ("2.3").
 */
export function citationDivisions(
  refs: string[],
  levelNames: string[],
  headers: HeaderMark[],
): CitationDivisions {
  const none: CitationDivisions = { headers, books: [], chapters: [] };
  const parts = refs.map((ref) => ref.split('.'));
  const tiers = levelNames
    .slice(0, -1)
    .map((name, index) => ({ name, index }))
    .filter((tier) => !GRID_TIER.test(tier.name));

  const valuesAt = (index: number) => new Set(parts.map((p) => p[index]).filter((v) => v !== undefined));
  const book = tiers.find((tier) => BOOK_TIER.test(tier.name) && valuesAt(tier.index).size > 1);
  const chapter = tiers.find((tier) => (book === undefined || tier.index > book.index) && !BOOK_TIER.test(tier.name));
  if (book === undefined && chapter === undefined) return none;

  const bookStarts: { value: string; row: number }[] = [];
  const titleRoots: HeaderMark[] = [];
  const found: { book?: string; value: string; row: number }[] = [];
  let lastBook: string | undefined;
  let lastChapter: string | undefined;

  parts.forEach((p, i) => {
    const row = i + 1;
    const bookValue = book ? p[book.index] : undefined;
    // A title is never a book: a <head> on a work-level div cites "1.t".
    const newBook =
      book !== undefined && bookValue !== undefined && !TITLE.test(bookValue) && bookValue !== lastBook;
    if (newBook) {
      lastBook = bookValue;
      bookStarts.push({ value: bookValue as string, row });
    }
    if (chapter === undefined) return;
    const value = p[chapter.index];
    if (value === undefined) return;
    if (TITLE.test(value)) {
      // The book's printed title. Only its first row is the heading.
      if (newBook) titleRoots.push({ row, level: 1 });
      return;
    }
    // The chapter is named by its division tiers only: a page tier above it
    // turns mid-chapter and must not start the chapter again.
    const key = tiers
      .filter((tier) => tier.index <= chapter.index)
      .map((tier) => p[tier.index])
      .join('.');
    if (key === lastChapter) return;
    lastChapter = key;
    found.push({ book: bookValue, value, row });
  });

  const merged = [...new Map([...headers, ...titleRoots].map((h) => [h.row, h])).values()].sort(
    (a, b) => a.row - b.row,
  );
  const rootRows = merged.map((h) => h.row);
  const booksFit = book !== undefined && bookStarts.every((b) => rootRows.includes(b.row));

  const books: BookContainer[] = booksFit
    ? bookStarts.map((b) => ({ label: `${capitalised(book.name)} ${b.value}`, start: rootRows.indexOf(b.row) + 1 }))
    : [];
  const chapters = chapter
    ? normalizeChapterContainers(
        found.map((c) => ({
          label: book !== undefined && !booksFit ? `${c.book}.${c.value}` : `${capitalised(chapter.name)} ${c.value}`,
          row: c.row,
        })),
      )
    : [];

  // Title rows are kept as headings only when they carry a Book: marked
  // without one they would leave the reading text for nothing.
  return { headers: booksFit ? merged : headers, books, chapters };
}
