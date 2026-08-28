/**
 * Known book and chapter divisions for the works this project has already
 * mapped, and the matcher that lands them on an imported work's rows.
 *
 * The problem this solves: a TLG disc carries the citation scheme its edition
 * prints and nothing else. For Aristotle that is the Bekker page and line, so
 * the Physics imports as eight title lines and 5,520 lines of Greek — none of
 * its 71 chapters, because the disc has no chapter level to export. The
 * divisions table (scripts/build-divisions.mjs) carries every chapter's start
 * as a Bekker address, taken from this repo's own pipeline output, and the
 * imported rows are addressed in exactly those coordinates. So the chapters can
 * be laid down by matching addresses — no marking, no guessing, no text moved.
 *
 * Nothing here is Aristotle-specific in kind: a work qualifies by carrying TLG
 * ids in its manifest and a chapters.json in the build, which is 46 works today.
 */

import { isTauri } from '../runtime';
import type { BookContainer } from './bookContainers';
import type { ChapterContainer } from './chapterContainers';
import { normalizeChapterContainers } from './chapterContainers';
import { bookLetterOf } from './bookLetter';

/** One work's divisions, as the generated table stores them. */
export interface WorkDivisions {
  /** Pipeline work id, e.g. "Phys". */
  id: string;
  title: string;
  /** TLG author number without the corpus prefix, e.g. "0086". */
  tlgAuthor: string;
  /** TLG work number as the disc writes it, e.g. "031". */
  tlgWork: string;
  books: { n: number; column: string; line: number }[];
  chapters: { book: number; n: number; column: string; line: number }[];
}

export interface DivisionsTable {
  version: number;
  works: WorkDivisions[];
}

/** A row's address, split. Pair citations ("205a.25,29" — a line the edition
 * numbers twice) keep their FIRST number: that is where the line begins. */
function parseRowRef(ref: string): { column: string; line: number } | null {
  const m = /^(\d+[ab])\.(\d+)/.exec(ref.trim());
  return m ? { column: m[1], line: Number(m[2]) } : null;
}

/**
 * The row a Bekker address lands on: the row that carries it, or — when the
 * edition does not print that exact line as a row of its own — the first row
 * after it in the same column. Null when the column never appears, which is
 * how a work whose export stops short reports the truth instead of guessing.
 */
export function rowForAddress(
  rowRefs: string[],
  column: string,
  line: number,
): number | null {
  let fallback: number | null = null;
  for (let i = 0; i < rowRefs.length; i++) {
    const parsed = parseRowRef(rowRefs[i]);
    if (parsed === null || parsed.column !== column) continue;
    if (parsed.line === line) return i + 1;
    if (fallback === null && parsed.line > line) fallback = i + 1;
  }
  return fallback;
}

export interface AppliedDivisions {
  books: BookContainer[];
  chapters: ChapterContainer[];
  /** Chapters whose address matched no row — reported, never silently dropped. */
  unmatched: { book: number; n: number; column: string; line: number }[];
}

/**
 * Turn a work's known divisions into containers for an imported file.
 *
 * Books are boundaries over the outline's root nodes, and an imported work's
 * roots are the title lines its edition prints. Where that is one per book —
 * the Physics, Politics, Topics, Meteorologica — Book n begins at root n. Where
 * it is not (the Ethics prints one title for ten books, the Metaphysics eleven
 * for fourteen), no Books are laid down and the chapters carry their book in
 * their own labels instead. A hierarchy built on a coincidence would be worse
 * than none.
 */
export function divisionsToContainers(
  divisions: WorkDivisions,
  rowRefs: string[],
  rootTexts: string[],
): AppliedDivisions {
  const outlineRootCount = rootTexts.length;
  // Books can only be laid down when the edition prints one title line per
  // book, since a Book boundary is an outline ROOT ordinal. Several works come
  // off the disc with fewer title lines than books (the Ethics prints one for
  // ten), and a hierarchy built on that would be a coincidence.
  const booksFit = outlineRootCount === divisions.books.length && divisions.books.length > 0;
  // A Book is named the way its edition names it: the title line the export
  // prints for it reduces to a letter ("Β.", or the "Α" ending "ΦΥΣΙΚΗΣ
  // ΑΚΡΟΑΣΕΩΣ Α"), and that letter is how the Greek tradition cites the book.
  // A title that is not a letter — the Oeconomica's ΠΡΩΤΟΣ and ΔΕΥΤΕΡΟΣ — gets
  // the number instead.
  const books: BookContainer[] = booksFit
    ? divisions.books.map((book, i) => ({
        label: `Book ${bookLetterOf(rootTexts[i] ?? '') ?? book.n}`,
        start: book.n,
      }))
    : [];

  // With the Books above them, a chapter is "Chapter 3" — its book is the
  // container it sits in. Without them the book has to travel with the
  // chapter, so the label is the citation itself: "2.3".
  const multiBook = divisions.books.length > 1;
  const labelFor = (book: number, n: number) =>
    booksFit || !multiBook ? `Chapter ${n}` : `${book}.${n}`;

  const chapters: ChapterContainer[] = [];
  const unmatched: AppliedDivisions['unmatched'] = [];

  for (const chapter of divisions.chapters) {
    const row = rowForAddress(rowRefs, chapter.column, chapter.line);
    if (row === null) {
      unmatched.push(chapter);
      continue;
    }
    chapters.push({ label: labelFor(chapter.book, chapter.n), row });
  }

  return { books, chapters: normalizeChapterContainers(chapters), unmatched };
}

// ── the shipped table ───────────────────────────────────────────────────────
//
// Read the same two ways the corpus is (see data/corpusStore.ts): a bundled
// app resource under Tauri, the vite dev middleware in the browser harness.
// A missing table is a normal state — the import simply arrives undivided.

let cached: DivisionsTable | null | undefined;

async function readTable(): Promise<DivisionsTable | null> {
  try {
    if (isTauri()) {
      const pathApi = await import('@tauri-apps/api/path');
      const fs = await import('@tauri-apps/plugin-fs');
      // The path as DECLARED in tauri.conf.json's bundle.resources — the
      // bundler puts resources one level deeper than a naive guess.
      const file = await pathApi.resolveResource('resources/corpus/divisions.json');
      if (!(await fs.exists(file))) return null;
      return JSON.parse(await fs.readTextFile(file)) as DivisionsTable;
    }
    const res = await fetch('/corpus/divisions.json');
    if (!res.ok) return null;
    return (await res.json()) as DivisionsTable;
  } catch (err) {
    console.warn('divisions: could not read the table', err);
    return null;
  }
}

/** The divisions table, read once per process. Null when it isn't shipped. */
export async function loadDivisions(): Promise<DivisionsTable | null> {
  if (cached !== undefined) return cached;
  cached = await readTable();
  return cached;
}

/** Test seam: drop the memoized table. */
export function resetDivisionsCache(): void {
  cached = undefined;
}

/**
 * The divisions for a disc work, by the ids the importer already has: an
 * author id as the disc writes it ("TLG0086") and a work number ("031").
 */
export function divisionsForDiscWork(
  table: DivisionsTable | null,
  authorId: string,
  workNumber: string,
): WorkDivisions | null {
  if (!table) return null;
  const author = authorId.replace(/^[A-Za-z]+/, '');
  return (
    table.works.find((w) => w.tlgAuthor === author && w.tlgWork === workNumber) ?? null
  );
}
