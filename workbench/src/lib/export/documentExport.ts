/**
 * documentCompileInput — turn a marker-driven document work's SINGLE file into
 * the (chapters, work) a compile expects, by splitting it at the Book/Chapter
 * marks in the text (the marker-driven model: the marks ARE the chapters). The
 * chapter/book labels come from those marked lines — heading-title override →
 * translation → original — exactly what the rail shows.
 *
 * A document with no Book/Chapter marks yields a single part and the work
 * unchanged, so compile takes its byte-identical single-document path.
 */

import type { ChapterFile } from '../chapterfile/types';
import type { WorkManifest, DocumentBook } from '../works/manifest';
import type { WorkMeta } from '../citation/types';
import { DEFAULT_PROFILE } from '../works/profile';
import { splitDocument, documentBookStructure } from '../library/splitDocument';
import { hydrateFromFile } from '../library/autosave';
import { buildOutline } from '../editor/outline';

export function documentCompileInput(
  file: ChapterFile,
  work: WorkManifest,
): { chapters: ChapterFile[]; work: WorkMeta } {
  const profile = work.profile ?? DEFAULT_PROFILE;
  const parts = splitDocument(file, profile);

  // No Book/Chapter marks → one part; leave the work as-is so compile renders a
  // plain titled document (no synthetic headings).
  if (parts.length <= 1) {
    return { chapters: parts.map((p) => p.file), work };
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
