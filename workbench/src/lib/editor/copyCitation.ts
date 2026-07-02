// Copy as citation (build spec §10) — pure assembly of the clipboard string
// from an already-resolved row range. DOM→row-range resolution (mapping the
// native Selection to touched rows and, within them, to English-cell text)
// stays in ChapterEditor.svelte, mirroring the existing cross-row onCopy
// handler; this module never touches the DOM so it's directly testable.
//
// Output, exactly:
//   `${english}. (${scheme.formatCitation(span, work)}: ${greek})`
// (the period after `english` is elided when it already ends in terminal
// punctuation — see needsPeriod).
//
// The parenthetical is produced ENTIRELY by scheme.formatCitation — no
// citation or range formatting is reimplemented here (one formatter, zero
// drift, per workbench-design/d2-citation-schemes.md). Addresses stay
// opaque: this module reads `row.address` only to pass it through to
// RefSpan.start/end, never inspecting or comparing `.raw`.

import type { Node as PMNode } from '@tiptap/pm/model';
import type { Address, CitationScheme, RefSpan, WorkMeta } from '../citation/types';

/** One touched row's material, already resolved from the live view/model. */
export interface CitationRowInput {
  address: Address;
  /** Full Greek spine text for the row — always used in full (no truncation). */
  greek: string;
  /** Full English row document, for rows the selection's English doesn't cover. */
  englishDoc: PMNode;
  /**
   * Plain-text English selected WITHIN this row's English cell, if the
   * selection covers part of it; null when it doesn't (Greek-cell selection,
   * caret-only, or a row the selection merely passes through — those rows
   * contribute their FULL English instead).
   */
  englishSelected: string | null;
}

export interface BuildCitationInput {
  rows: CitationRowInput[];
  scheme: CitationScheme;
  work: WorkMeta;
  book: number;
  chapter: number;
}

export type BuildCitationResult =
  | { kind: 'copied'; text: string }
  | { kind: 'empty' };

/** Plain text of a full row's English content (marks stripped, markers omitted). */
function fullRowText(doc: PMNode): string {
  return doc.textBetween(0, doc.content.size, ' ', '');
}

/**
 * Terminal punctuation (., !, ?, …), optionally followed by ONE closing
 * quote/bracket ("  '  ”  ’  )). English already ending this way gets no
 * extra period — `…being qua being.. (` was a real bug.
 */
const ENDS_TERMINAL = /[.!?…]["'”’)]?$/;

function needsPeriod(english: string): boolean {
  return !ENDS_TERMINAL.test(english);
}

/**
 * Assemble the clipboard string for a touched row range.
 *
 * English, PER ROW: the row's selected English text when the selection
 * covers part of its English cell (englishSelected !== null); otherwise the
 * row's FULL English (caret-only, Greek-cell selections, and rows a
 * selection passes through without an English endpoint). Contributions are
 * joined with single spaces; rows whose contribution is empty are skipped
 * (no doubled spaces). If every touched row contributes nothing, nothing is
 * copied.
 *
 * Greek: always the full spine text of every touched row, joined with
 * single spaces — never truncated (explicit Phase 2 decision).
 */
export function buildCitationClipboardText(input: BuildCitationInput): BuildCitationResult {
  const { rows, scheme, work, book, chapter } = input;
  if (rows.length === 0) return { kind: 'empty' };

  const englishParts = rows
    .map((r) => r.englishSelected ?? fullRowText(r.englishDoc))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (englishParts.length === 0) return { kind: 'empty' };
  const english = englishParts.join(' ');

  const greek = rows
    .map((r) => r.greek.trim())
    .filter((s) => s.length > 0)
    .join(' ');

  const first = rows[0];
  const last = rows[rows.length - 1];
  const span: RefSpan = {
    scheme: scheme.id,
    book,
    chapter,
    start: first.address,
    end: last.address,
  };

  const citation = scheme.formatCitation(span, work);
  const period = needsPeriod(english) ? '.' : '';
  return { kind: 'copied', text: `${english}${period} (${citation}: ${greek})` };
}
