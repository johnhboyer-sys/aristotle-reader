// Chapter-assignment pre-pass for reference-translation import (design doc D5
// S1d/S5). PURE: detects Markdown headings and inline `[book.chapter]`
// markers to PROPOSE a split into per-chapter blocks. The import dialog
// (built elsewhere) renders and lets the user edit this proposal before
// writing anything — nothing here touches storage.

export interface ProposedBlock {
  /** null when no structure was detected for this block (user must assign manually). */
  book: number | null;
  chapter: number | null;
  text: string;
}

/** Reserved for a future "assign at finer than book+chapter" mode; unused today. */
export type WorkBooks = readonly number[];

const BOOK_HEADING_RE = /^#{1,6}\s*Book\s+(\d+)\s*$/i;
const CHAPTER_HEADING_RE = /^#{1,6}\s*(?:Chapter\s+)?(\d+)\s*$/i;
const INLINE_MARKER_RE = /^\[(\d+)\.(\d+)\]\s*(.*)$/;

interface Heading {
  lineIndex: number;
  book: number | null;
  chapter: number | null;
  /** Text remaining on the heading's own line after stripping an inline marker, if any. */
  inlineText: string | null;
}

/**
 * Scan lines for chapter-bearing structure: `# Book 7` headings set the
 * "current book" context for subsequent `## 17` / `### Chapter 17` headings;
 * a `[7.17]` inline marker at the start of a line is self-contained (sets
 * both book and chapter) and does not require a preceding Book heading.
 *
 * Returns the chapter-emitting headings (`headings`) plus the full set of
 * boundary line indices (`boundaryLines`, headings + bare Book lines) used
 * only to cap where a block's body text ends — a `# Book 2` line must stop
 * the previous chapter's body even though it emits no block of its own.
 */
function findHeadings(lines: string[]): { headings: Heading[]; boundaryLines: number[] } {
  const headings: Heading[] = [];
  const boundaryLines: number[] = [];
  let currentBook: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const bookMatch = BOOK_HEADING_RE.exec(line);
    if (bookMatch) {
      currentBook = Number(bookMatch[1]);
      boundaryLines.push(i);
      continue;
    }

    const markerMatch = INLINE_MARKER_RE.exec(line);
    if (markerMatch) {
      const book = Number(markerMatch[1]);
      currentBook = book;
      headings.push({
        lineIndex: i,
        book,
        chapter: Number(markerMatch[2]),
        inlineText: markerMatch[3],
      });
      boundaryLines.push(i);
      continue;
    }

    const chapterMatch = CHAPTER_HEADING_RE.exec(line);
    if (chapterMatch && currentBook !== null) {
      headings.push({
        lineIndex: i,
        book: currentBook,
        chapter: Number(chapterMatch[1]),
        inlineText: null,
      });
      boundaryLines.push(i);
    }
  }

  return { headings, boundaryLines };
}

/**
 * Detect Markdown headings (`# Book 7`, `## 17`, `### Chapter 17`) and inline
 * `[7.17]` markers, proposing {book, chapter, text} blocks. If no structure is
 * detected, returns a single block with `book`/`chapter` null (the caller's
 * dialog falls back to a one-row "assign the whole paste" picker).
 *
 * `workBooks` is accepted for a future finer-grained assignment mode; it does
 * not affect detection in this slice.
 */
export function proposeSplits(text: string, _workBooks?: WorkBooks): ProposedBlock[] {
  const lines = text.split('\n');
  const { headings, boundaryLines } = findHeadings(lines);

  if (headings.length === 0) {
    const whole = text.trim();
    return [{ book: null, chapter: null, text: whole }];
  }

  const blocks: ProposedBlock[] = [];
  for (let h = 0; h < headings.length; h++) {
    const heading = headings[h];
    // The body runs until the next boundary line (a chapter heading, an
    // inline marker, OR a bare Book heading — the latter emits no block of
    // its own but must still stop this one's body).
    const nextBoundary = boundaryLines.find((l) => l > heading.lineIndex);
    const bodyEnd = nextBoundary ?? lines.length;
    const bodyStart = heading.lineIndex + 1;
    const bodyLines = lines.slice(bodyStart, bodyEnd);
    const body = bodyLines.join('\n').trim();
    const text2 =
      heading.inlineText && heading.inlineText.length > 0
        ? [heading.inlineText, body].filter((s) => s.length > 0).join('\n').trim()
        : body;
    blocks.push({ book: heading.book, chapter: heading.chapter, text: text2 });
  }

  return blocks.filter((b) => b.text.length > 0);
}
