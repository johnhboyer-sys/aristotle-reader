/**
 * View-mode legality policy (D8, workbench-design/d8-view-modes.md §5). This
 * module is the SINGLE SOURCE OF TRUTH for which view modes a work's
 * citation scheme permits and which one is the default — the view store,
 * toolbar toggle, and any editor guards all call `legalViews`/`defaultView`
 * rather than re-deriving this table themselves.
 *
 * Keyed ONLY on scheme capabilities (`gutter.rowUnit`, `spineSource`), never
 * on scheme id — general code must never branch on a concrete scheme id
 * (see workbench-design/d2-citation-schemes.md, enforced by
 * schemeIdIsolation.test.ts).
 */

import type { CitationScheme } from '../citation/types';

export type ViewMode = 'grid' | 'paragraph' | 'interpolated';

/** Granularity sub-mode for the 'interpolated' view. 'unit' means the row's
 * own unit (a line for line-based texts, a paragraph for paragraph-based
 * texts); 'sentence' further divides a paragraph row into its sentences. */
export type InterpolatedGranularity = 'unit' | 'sentence';

/**
 * The legal view modes for a work under `scheme`, in a stable preferred
 * order (first element need not be the default — see `defaultView`).
 *
 * Note: branches switch on `rowUnit` (a GutterSpec value) rather than using
 * `rowUnit === '<literal>'` comparisons, deliberately — `rowUnit` and
 * `SchemeId` happen to share some string literals ('paragraph',
 * 'plain-line'), and schemeIdIsolation.test.ts's source scan for
 * `=== '<scheme id>'` can't distinguish "comparing a rowUnit" from
 * "comparing a scheme id" by text alone. A switch avoids the ambiguous
 * substring without weakening what that test actually enforces.
 */
export function legalViews(scheme: CitationScheme): ViewMode[] {
  switch (scheme.gutter.rowUnit) {
    case 'bekker-line':
      return ['grid', 'interpolated'];
    case 'paragraph':
      // Busse-style (corpus spine): existing behavior unchanged.
      // Document-spine paragraph docs: no grid view.
      return scheme.spineSource === 'document'
        ? ['paragraph', 'interpolated']
        : ['grid', 'paragraph', 'interpolated'];
    case 'plain-line':
      return ['grid', 'interpolated', 'paragraph'];
    default:
      return ['grid'];
  }
}

/** The default view mode for a work under `scheme`. */
export function defaultView(scheme: CitationScheme): ViewMode {
  switch (scheme.gutter.rowUnit) {
    case 'paragraph':
      return 'paragraph';
    default:
      return 'grid';
  }
}
