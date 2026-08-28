/**
 * Chapter boundaries for a document work.
 *
 * A Book container is a boundary over the outline's ROOT NODES; a chapter
 * boundary is the same idea one level down, and keyed to a ROW: "chapter 2
 * starts at row 576". It has to be a boundary rather than a mark, because a
 * marked row becomes a title and drops out of the flowing text — and a chapter
 * of the Physics starts in the middle of the prose, at 184b15, on a line the
 * reader still needs to read. Marking it would quietly delete that line.
 *
 * So: nothing here inserts, moves, or deletes a row. These are labels with row
 * numbers, saved beside the work in the registry, and the rail renders them as
 * navigation.
 */

export interface ChapterContainer {
  label: string;
  /** 1-based index of the row this chapter begins at. */
  row: number;
}

/** Defensive registry cap. The longest work here has 231 chapters. */
export const MAX_CHAPTER_CONTAINERS = 2000;

/**
 * Put the boundaries in document order and drop the ones that would sit on top
 * of each other. Two chapters cannot begin at the same row: whichever came
 * first in the list keeps the row, so a re-applied division never doubles up.
 */
export function normalizeChapterContainers(list: ChapterContainer[]): ChapterContainer[] {
  const seen = new Set<number>();
  const out: ChapterContainer[] = [];
  for (const container of list) {
    if (out.length >= MAX_CHAPTER_CONTAINERS) break;
    if (!Number.isInteger(container.row) || container.row < 1) continue;
    if (seen.has(container.row)) continue;
    seen.add(container.row);
    out.push({ label: container.label, row: container.row });
  }
  return out.sort((a, b) => a.row - b.row);
}

/**
 * LENIENT registry-data sanitizer, same policy as the Book containers': bad
 * data must never take down the library rail. An entry with no usable row is
 * dropped rather than coerced — unlike a Book, whose position in the list is
 * load-bearing, a chapter boundary IS its row, and a guessed one would point
 * the reader at the wrong line.
 */
export function sanitizeChapterContainers(raw: unknown): ChapterContainer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const containers: ChapterContainer[] = [];
  for (const entry of raw) {
    if (containers.length >= MAX_CHAPTER_CONTAINERS) break;
    if (typeof entry !== 'object' || entry === null) continue;
    const value = entry as { label?: unknown; row?: unknown };
    if (typeof value.row !== 'number' || !Number.isInteger(value.row) || value.row < 1) continue;
    containers.push({
      label: typeof value.label === 'string' ? value.label.trim() : '',
      row: value.row,
    });
  }
  const normalized = normalizeChapterContainers(containers);
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * The chapters that belong to one Book, given the row each Book begins at.
 * A chapter belongs to the last Book that starts at or before it, which is
 * what "the chapters of Book Γ" means in a document read top to bottom.
 */
export function chaptersInBook(
  chapters: ChapterContainer[],
  bookStartRow: number,
  nextBookStartRow: number | null,
): ChapterContainer[] {
  return chapters.filter(
    (c) => c.row >= bookStartRow && (nextBookStartRow === null || c.row < nextBookStartRow),
  );
}
