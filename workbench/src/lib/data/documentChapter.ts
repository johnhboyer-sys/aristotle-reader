/**
 * documentChapter — build the ChapterEditor's input for a DOCUMENT-SPINE work
 * (workbench-design/d8-view-modes.md §1/§6: corpus-free documents). There is
 * no corpus here: the chapter file itself is the spine, so the editor's rows
 * come from the file's [GREEK] section with synthetic ordinal addresses
 * (rowAddressSource's document arm). book/chapter come from the FILE's meta —
 * a single-document work is 1/1, but a document split into parts (D8 heading
 * tools → navigable chapters) opens each part at its own book/chapter, and the
 * fixture must carry those so the editor labels + autosaves to the right file.
 *
 * The mirror of chapterRows.ts's chapterForEditor for spineSource:
 * 'document' — App gates between the two on the scheme CAPABILITY, never on
 * a scheme id (schemeIdIsolation.test.ts).
 */

import { getScheme } from '../citation/registry';
import type { WorkManifest } from '../works/manifest';
import type { ChapterFile } from '../chapterfile';
import { rowAddressSource } from '../library/autosave';
import { DEFAULT_PROFILE } from '../works/profile';
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
    book: file.meta.book,
    bookLabel: scheme.bookLabel(file.meta.book, work),
    chapter: file.meta.chapter,
    bekkerRange: scheme.formatRange({
      scheme: work.scheme,
      start: lines[0].address,
      end: lines[count - 1].address,
    }),
    // The work's organization profile (D8 heading tools) rides on the fixture so
    // the editor's heading menu shows the user's named tiers; default otherwise.
    profile: work.profile ?? DEFAULT_PROFILE,
    lines,
  };
}
