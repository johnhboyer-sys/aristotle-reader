// ChapterModel — the single source of truth for an open chapter (design doc
// D1 §"Model"). Row count is owned by the Greek spine; nothing the user does
// creates or destroys a row. Editors commit into the model (blur/idle);
// autosave will serialize FROM it (serialize.ts), never from the live views.

import type { Address, SchemeId } from '../citation/types';
import type { PMDocJSON } from './schema';
import { emptyRowDocJSON } from './schema';
import type { FixtureChapter } from '../../dev/fixture-meta-z17';

export interface RowModel {
  /** Opaque scheme-owned address; the gutter shows `address.raw` verbatim. */
  address: Address;
  /** The Greek spine line — read-only in the editor. */
  greek: string;
  /** Committed English row doc (PM JSON). Live views may be ahead until commit. */
  english: PMDocJSON;
}

export interface Footnote {
  /** Chapter-local id (build spec §3); display numbers are computed. */
  id: string;
  body: string;
  /** False once the user deletes the marker — body kept, recoverable. */
  anchored: boolean;
}

export interface ChapterModel {
  workId: string;
  workTitle: string;
  scheme: SchemeId;
  book: number;
  bookLabel: string;
  chapter: number;
  bekkerRange: string;
  rows: RowModel[];
  footnotes: Footnote[];
  dirty: boolean;
}

export function modelFromFixture(fixture: FixtureChapter): ChapterModel {
  return {
    workId: fixture.workId,
    workTitle: fixture.workTitle,
    scheme: fixture.scheme,
    book: fixture.book,
    bookLabel: fixture.bookLabel,
    chapter: fixture.chapter,
    bekkerRange: fixture.bekkerRange,
    rows: fixture.lines.map((line) => ({
      address: line.address,
      greek: line.greek,
      english: emptyRowDocJSON(),
    })),
    footnotes: [],
    dirty: false,
  };
}

/** Next chapter-local footnote id: max numeric id + 1 (ids stay stable). */
export function nextFootnoteId(footnotes: Footnote[]): string {
  let max = 0;
  for (const fn of footnotes) {
    const n = Number(fn.id);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function cloneFootnotes(footnotes: Footnote[]): Footnote[] {
  return footnotes.map((fn) => ({ ...fn }));
}

/**
 * Display numbers for anchored footnotes: 1-based, in document order of their
 * markers (row order, then position within the row). Computed on demand,
 * never stored (design doc D1 §"Footnotes").
 *
 * `markerOrder` = footnote ids in document order, as collected from the rows.
 */
export function displayNumbers(markerOrder: string[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 0;
  for (const id of markerOrder) {
    if (!map.has(id)) map.set(id, ++n);
  }
  return map;
}
