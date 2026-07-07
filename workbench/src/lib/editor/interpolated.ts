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
  const offsets = [
    ...new Set((splitOffsets ?? []).filter((o) => Number.isInteger(o) && o > 0 && o < source.length)),
  ].sort((a, b) => a - b);
  const out: string[] = [];
  let prev = 0;
  for (const o of offsets) {
    out.push(source.slice(prev, o).trim());
    prev = o;
  }
  out.push(source.slice(prev).trim());
  const nonEmpty = out.filter((s) => s.length > 0);
  return nonEmpty.length > 0 ? nonEmpty : [''];
}
