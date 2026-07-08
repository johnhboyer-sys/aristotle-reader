/**
 * documentChapter — build the ChapterEditor's input for a DOCUMENT-SPINE work
 * (workbench-design/d8-view-modes.md §1/§6: corpus-free documents). There is
 * no corpus here: the chapter file itself is the spine, so the editor's rows
 * come from the file's [GREEK] section with synthetic ordinal addresses
 * (rowAddressSource's document arm), book/chapter fixed at 1/1 (v1 free works
 * are a single document).
 *
 * The mirror of chapterRows.ts's chapterForEditor for spineSource:
 * 'document' — App gates between the two on the scheme CAPABILITY, never on
 * a scheme id (schemeIdIsolation.test.ts).
 */

import { getScheme } from '../citation/registry';
import type { WorkManifest } from '../works/manifest';
import type { ChapterFile } from '../chapterfile';
import { rowAddressSource } from '../library/autosave';
import type { FixtureChapter } from '../../dev/fixture-meta-z17';

/**
 * The editor fixture for a document-spine work's single chapter, built from
 * the saved chapter file itself. Null when the file has no rows (a
 * well-formed file can't — span_start wouldn't parse — but a caller-supplied
 * degenerate stays a quiet unavailable state, matching chapterForEditor).
 */
export function documentChapterForEditor(
  work: WorkManifest,
  file: ChapterFile,
): FixtureChapter | null {
  const scheme = getScheme(work.scheme);
  if (scheme.spineSource !== 'document') {
    throw new Error(
      `documentChapterForEditor: work "${work.id}" uses a corpus-spine scheme — use chapterForEditor`,
    );
  }
  const count = file.greekLines.length;
  if (count === 0) return null;

  // Document arm: ordinal addresses derived from row position (never
  // persisted). The spine argument is unused under this arm — pass [].
  const addressOf = rowAddressSource(file.meta, [], scheme);

  const lines = file.greekLines.map((greek, i) => ({ address: addressOf(i + 1), greek }));

  return {
    workId: work.id,
    workTitle: work.title,
    author: work.author,
    // Free works carry the user's verbatim language label (or none = unknown)
    // for the assist prompts; there is no 'greek' default here on purpose.
    ...(work.language !== undefined ? { language: work.language } : {}),
    scheme: work.scheme,
    book: 1,
    bookLabel: scheme.bookLabel(1, work),
    chapter: 1,
    bekkerRange: scheme.formatRange({
      scheme: work.scheme,
      start: lines[0].address,
      end: lines[count - 1].address,
    }),
    lines,
  };
}
