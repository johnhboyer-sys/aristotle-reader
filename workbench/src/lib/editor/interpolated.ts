// Interpolated-view policy + display helpers (D8 §5,
// workbench-design/d8-view-modes.md). Pure and node-testable — ChapterEditor
// derives its view state from these; the reactive plumbing stays in the
// component.
//
// Everything here branches ONLY on scheme capabilities (`gutter.rowUnit`,
// `spineSource`) and view state, never a scheme id (d2 contract, enforced by
// schemeIdIsolation.test.ts). rowUnit/mode comparisons against strings that
// double as scheme ids ('paragraph', 'plain-line') use `switch` — the
// sanctioned form (see viewPolicy.ts's header for why).

import type { CitationScheme } from '../citation/types';
import type { ViewMode, InterpolatedGranularity } from './viewPolicy';

/**
 * Whether the ACTIVE editing layer is the paragraph layer (`englishPara`,
 * D8 §4) rather than the sentence layer (`english`/`english2`).
 *
 * True exactly for paragraph-row-unit docs in:
 * - the `paragraph` view (D1's paragraph-unit view, semantics unchanged), or
 * - the `interpolated` view at `'unit'` granularity (one block per paragraph
 *   row, its field editing `englishPara`).
 *
 * `'sentence'` granularity — and every view of a line-based doc — edits the
 * normal sentence layer (segment i ↔ sentence i, plain D6 identity).
 */
export function usesParaLayer(
  scheme: CitationScheme,
  mode: ViewMode,
  granularity: InterpolatedGranularity,
): boolean {
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      break;
    default:
      return false;
  }
  switch (mode) {
    case 'paragraph':
      return true;
    case 'interpolated':
      return granularity === 'unit';
    default:
      return false;
  }
}

/**
 * Whether the interpolated granularity sub-toggle is offered (D8 §5): ONLY
 * while the interpolated view is active on a paragraph-row-unit doc — the one
 * row unit with two meaningful granularities. Line-based docs interpolate by
 * line (their natural unit).
 */
export function showGranularityToggle(scheme: CitationScheme, mode: ViewMode): boolean {
  if (mode !== 'interpolated') return false;
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      return true;
    default:
      return false;
  }
}

/**
 * Display slices of a unit's original text: the source divided at
 * `splitOffsets` (D6 sentence boundaries — code-unit offsets into `source`),
 * each slice trimmed for display. The interpolated unit view renders the
 * slices with a subtle separator at each boundary; a block with no divisions
 * is one slice. DISPLAY-ONLY — the model text is never touched.
 *
 * Defensive about offsets (hydration drift may leave them short/odd):
 * out-of-range, non-integer, duplicate or unsorted offsets are
 * normalized/ignored rather than throwing; empty slices (double boundary)
 * are dropped. An empty source yields [''] so callers can test emptiness.
 */
export function sourceSlices(source: string, splitOffsets?: number[]): string[] {
  return sourceSliceSpans(source, splitOffsets).map((s) => s.text);
}

/** A display slice with its provenance: `start` is the MODEL offset of the
 * trimmed text's first character within `source`. The spans concatenate to
 * exactly what the interpolated source block displays (separators render as
 * empty elements and contribute no text), which is what lets a caret offset
 * measured in the DOM map back to a model offset. */
export interface SourceSliceSpan {
  text: string;
  start: number;
}

export function sourceSliceSpans(source: string, splitOffsets?: number[]): SourceSliceSpan[] {
  const offsets = [
    ...new Set((splitOffsets ?? []).filter((o) => Number.isInteger(o) && o > 0 && o < source.length)),
  ].sort((a, b) => a - b);
  const spans: SourceSliceSpan[] = [];
  let prev = 0;
  for (const end of [...offsets, source.length]) {
    const raw = source.slice(prev, end);
    const text = raw.trim();
    if (text.length > 0) {
      spans.push({ text, start: prev + (raw.length - raw.trimStart().length) });
    }
    prev = end;
  }
  return spans.length > 0 ? spans : [{ text: '', start: 0 }];
}

/**
 * Map a caret offset measured in the interpolated source block's DISPLAY
 * text (the trimmed slices concatenated — separators contribute nothing)
 * back to the corresponding MODEL offset in `source`. An offset that falls
 * exactly between two slices resolves to the NEXT slice's start: a caret at
 * a join came from clicking the left edge of the next slice's first word,
 * and the earlier slice's trimmed end may sit mid-whitespace, where the
 * word-start snap would fail. Only the final display end resolves to the
 * last slice's end. Returns null when the offset lies beyond the display
 * text.
 */
export function sourceOffsetAtDisplay(
  source: string,
  splitOffsets: number[] | undefined,
  displayOffset: number,
): number | null {
  if (displayOffset < 0) return null;
  const spans = sourceSliceSpans(source, splitOffsets);
  let acc = 0;
  for (let i = 0; i < spans.length; i++) {
    const len = spans[i].text.length;
    const last = i === spans.length - 1;
    if (displayOffset < acc + len || (last && displayOffset === acc + len)) {
      return spans[i].start + (displayOffset - acc);
    }
    acc += len;
  }
  return null;
}
