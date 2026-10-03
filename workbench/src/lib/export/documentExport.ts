/**
 * documentCompileInput — turn a marker-driven document work's SINGLE file into
 * the (chapters, work) a compile expects, by splitting it at the Book/Chapter
 * marks in the text (the marker-driven model: the marks ARE the chapters). The
 * chapter/book labels come from those marked lines — heading-title override →
 * translation → original — exactly what the rail shows.
 *
 * A document with no Book/Chapter marks yields a single part and the work
 * unchanged, so compile takes its byte-identical single-document path.
 *
 * When `documentBookContainers` is set, Book labels and the partition of parts
 * into Books come from those containers (boundaries over outline root nodes);
 * chapter labels still come from the marked lines.
 */

import type { ChapterFile } from '../chapterfile/types';
import type { WorkManifest, DocumentBook } from '../works/manifest';
import type { WorkMeta } from '../citation/types';
import { DEFAULT_PROFILE } from '../works/profile';
import type { WorkProfile } from '../works/profile';
import { splitDocument, splitDocumentAt, documentBookStructure } from '../library/splitDocument';
import { normalizeChapterContainers } from '../works/chapterContainers';
import type { ChapterContainer } from '../works/chapterContainers';
import { hydrateFromFile } from '../library/autosave';
import { buildOutline, buildOutlineTree } from '../editor/outline';
import type { OutlineNode } from '../editor/outline';
import { normalizeContainers } from '../works/bookContainers';
import type { BookContainer } from '../works/bookContainers';

/**
 * 1-based ordinal of the outline root that owns a part starting at `start0`,
 * or 0 when the part begins before every root (a leading preface with no
 * book/chapter mark on row 1).
 *
 * splitDocument parts are NOT always 1:1 with outline roots:
 *   - a leading unmarked run is its own part but never a root;
 *   - a legacy book-mark root owns both its opening part and every nested
 *     chapter part until the next root;
 *   - heading-only roots never open a part.
 * Ownership is therefore "last root whose row is ≤ the part's start".
 */
function rootOrdinalForPart(start0: number, roots: OutlineNode[]): number {
  let ord = 0;
  for (let i = 0; i < roots.length; i++) {
    if (roots[i].item.rowIndex <= start0) ord = i + 1;
    else break;
  }
  return ord;
}

/** 0-based container index that owns a 1-based root ordinal (0 → first Book). */
function bookIndexForRootOrdinal(rootOrdinal: number, containers: BookContainer[]): number {
  if (rootOrdinal <= 0) return 0;
  let bi = 0;
  for (let i = 0; i < containers.length; i++) {
    if (containers[i].start <= rootOrdinal) bi = i;
    else break;
  }
  return bi;
}

function compileWithContainers(
  file: ChapterFile,
  work: WorkManifest,
  profile: WorkProfile,
  parts: ReturnType<typeof splitDocument>,
  rawContainers: BookContainer[],
): { chapters: ChapterFile[]; work: WorkMeta } {
  const containers = normalizeContainers(rawContainers);
  const rows = hydrateFromFile(file, [], work.scheme).rows;
  const outline = buildOutline(rows, profile);
  const roots = buildOutlineTree(outline);
  const labelByRow = new Map(outline.map((it) => [it.rowIndex, it.label] as const));
  // Same segment walk as splitDocument → one label per part, from the marked line.
  const partLabels = documentBookStructure(file, profile, (i) => labelByRow.get(i) ?? '').flatMap((b) =>
    b.chapters.map((c) => c.label),
  );

  // Contiguous parts recover each segment's original 0-based start row.
  const partStarts: number[] = [];
  {
    let offset = 0;
    for (const p of parts) {
      partStarts.push(offset);
      offset += p.file.greekLines.length;
    }
  }

  const bookParts: { file: ChapterFile; label: string }[][] = containers.map(() => []);
  parts.forEach((p, i) => {
    const bi = bookIndexForRootOrdinal(rootOrdinalForPart(partStarts[i], roots), containers);
    bookParts[bi].push({ file: p.file, label: partLabels[i] ?? `Chapter ${i + 1}` });
  });

  const documentBooks: DocumentBook[] = containers.map((c, bi) => ({
    n: bi + 1,
    label: c.label,
    chapters: bookParts[bi].map((ch, ci) => ({ n: ci + 1, label: ch.label })),
  }));

  const chapters: ChapterFile[] = [];
  bookParts.forEach((group, bi) => {
    group.forEach((ch, ci) => {
      chapters.push({
        ...ch.file,
        meta: { ...ch.file.meta, book: bi + 1, chapter: ci + 1 },
      });
    });
  });

  const workOut: WorkMeta = {
    ...work,
    books: documentBooks.map((b) => ({ n: b.n, label: b.label })),
    documentBooks,
  } as WorkMeta;
  return { chapters, work: workOut };
}

/**
 * An imported work: Book and chapter BOUNDARIES and no marks, so the marks give
 * one part and the boundaries must give the rest. Without this the Physics
 * printed "## Book Α" once, every later book as a stray "#### Β." heading, and
 * none of its 71 chapters.
 *
 * A part begins at each Book's first outline root and at each chapter row. A
 * book's opening title lines join its first chapter rather than standing as a
 * chapter of their own, so "## Book 2" is followed by "### Chapter 1", not by
 * a "Chapter 1" holding only "Β." With chapters and no Books (Theophrastus'
 * fragments) the work is one unlabelled Book, and compile prints no Book
 * heading over it.
 */
function compileWithBoundaries(
  file: ChapterFile,
  work: WorkManifest,
  profile: WorkProfile,
  rawBooks: BookContainer[],
  chapterBoundaries: ChapterContainer[],
): { chapters: ChapterFile[]; work: WorkMeta } {
  const containers = rawBooks.length > 0 ? normalizeContainers(rawBooks) : [{ label: '', start: 1 }];
  const rows = hydrateFromFile(file, [], work.scheme).rows;
  const roots = buildOutlineTree(buildOutline(rows, profile));
  const rowCount = file.greekLines.length;

  const bookStarts = containers.map((c, bi) => (bi === 0 ? 0 : roots[c.start - 1]?.item.rowIndex ?? rowCount));
  const chapterAt = new Map<number, string>();
  for (const c of normalizeChapterContainers(chapterBoundaries)) {
    if (c.row - 1 < rowCount) chapterAt.set(c.row - 1, c.label);
  }

  // The first chapter of each book absorbs the title lines before it.
  const starts = new Set<number>([...bookStarts.filter((s) => s < rowCount), ...chapterAt.keys()]);
  const labelAt = new Map(chapterAt);
  bookStarts.forEach((start, bi) => {
    const end = bookStarts[bi + 1] ?? rowCount;
    const first = [...chapterAt.keys()].filter((r) => r >= start && r < end).sort((a, b) => a - b)[0];
    if (first === undefined || first === start) return;
    starts.delete(first);
    labelAt.set(start, chapterAt.get(first) ?? '');
  });

  const parts = splitDocumentAt(file, [...starts]);
  const partStarts: number[] = [];
  {
    let offset = 0;
    for (const p of parts) {
      partStarts.push(offset);
      offset += p.file.greekLines.length;
    }
  }

  const bookParts: { file: ChapterFile; label: string }[][] = containers.map(() => []);
  parts.forEach((p, i) => {
    const bi = rawBooks.length > 0 ? bookIndexForRootOrdinal(rootOrdinalForPart(partStarts[i], roots), containers) : 0;
    const label = labelAt.get(partStarts[i]) || `Chapter ${bookParts[bi].length + 1}`;
    bookParts[bi].push({ file: p.file, label });
  });
  return assembleBooks(work, containers, bookParts, rawBooks.length === 0, true);
}

/** The compile input for parts already grouped into Books. */
function assembleBooks(
  work: WorkManifest,
  containers: BookContainer[],
  bookParts: { file: ChapterFile; label: string }[][],
  unheaded = false,
  keepsFirstRow = false,
): { chapters: ChapterFile[]; work: WorkMeta } {
  const documentBooks: DocumentBook[] = containers.map((c, bi) => ({
    n: bi + 1,
    label: c.label,
    chapters: bookParts[bi].map((ch, ci) => ({ n: ci + 1, label: ch.label, ...(keepsFirstRow ? { keepsFirstRow } : {}) })),
    ...(unheaded ? { unheaded } : {}),
  }));
  const chapters: ChapterFile[] = [];
  bookParts.forEach((group, bi) => {
    group.forEach((ch, ci) => {
      chapters.push({ ...ch.file, meta: { ...ch.file.meta, book: bi + 1, chapter: ci + 1 } });
    });
  });
  const workOut: WorkMeta = {
    ...work,
    books: documentBooks.map((b) => ({ n: b.n, label: b.label })),
    documentBooks,
  } as WorkMeta;
  return { chapters, work: workOut };
}

export function documentCompileInput(
  file: ChapterFile,
  work: WorkManifest,
): { chapters: ChapterFile[]; work: WorkMeta } {
  const profile = work.profile ?? DEFAULT_PROFILE;
  const parts = splitDocument(file, profile);

  // No marks to split at, but Book or chapter boundaries: an imported work.
  // A work with marks keeps the path below unchanged.
  const chapterBoundaries = work.documentChapterContainers ?? [];
  const bookBoundaries = work.documentBookContainers ?? [];
  if (parts.length <= 1 && (chapterBoundaries.length > 0 || bookBoundaries.length > 0)) {
    return compileWithBoundaries(file, work, profile, bookBoundaries, chapterBoundaries);
  }

  // Book containers (boundaries over outline roots) override mark-derived Book
  // grouping. Chapter labels still come from the marked lines.
  const containers = work.documentBookContainers;
  if (containers && containers.length > 0) {
    return compileWithContainers(file, work, profile, parts, containers);
  }

  // No Book/Chapter marks → one part: a plain titled document. Strip any stale
  // registry `documentBooks` (left over from the retired container model) so
  // compile takes its byte-identical single-document path instead of rendering
  // the document under long-dead slot labels.
  if (parts.length <= 1) {
    const { documentBooks: _stale, ...rest } = work;
    return { chapters: parts.map((p) => p.file), work: rest };
  }

  const rows = hydrateFromFile(file, [], work.scheme).rows;
  const labelByRow = new Map(buildOutline(rows, profile).map((it) => [it.rowIndex, it.label] as const));
  const books = documentBookStructure(file, profile, (i) => labelByRow.get(i) ?? '');
  const documentBooks: DocumentBook[] = books.map((b, bi) => ({
    n: bi + 1,
    label: b.label,
    chapters: b.chapters.map((c, ci) => ({ n: ci + 1, label: c.label })),
  }));
  const workOut: WorkMeta = {
    ...work,
    books: documentBooks.map((b) => ({ n: b.n, label: b.label })),
    documentBooks,
  } as WorkMeta;
  return { chapters: parts.map((p) => p.file), work: workOut };
}
