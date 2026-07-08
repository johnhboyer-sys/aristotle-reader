// Per-work view mode + interpolated granularity (D8 §5,
// workbench-design/d8-view-modes.md). Follows the zoom.svelte.ts pattern: a
// reactive rune store, persisted to localStorage, that the toolbar toggle
// writes and ChapterEditor reads to project the same editor core into a
// `grid` / `paragraph` / `interpolated` view.
//
// The store is ALWAYS validated against viewPolicy — the single source of
// truth for which views a scheme permits (`legalViews`) and its default
// (`defaultView`). A persisted value that is no longer legal for the work's
// scheme (scheme change, older persisted string) silently falls back to the
// scheme default, never to an illegal mode. View choice is UI preference: it
// lives here, never in the chapter file (design resolution, §5).

import type { CitationScheme } from '../citation/types';
import { legalViews, defaultView } from './viewPolicy';
import type { ViewMode, InterpolatedGranularity } from './viewPolicy';

export type { ViewMode, InterpolatedGranularity } from './viewPolicy';

const MODE_KEY = 'workbench:viewMode';
const GRAN_KEY = 'workbench:interpGranularity';

const GRANULARITIES: InterpolatedGranularity[] = ['unit', 'sentence'];

/** Per-work map read from localStorage: `{ [workId]: mode }`. Corrupt / absent
 * storage yields an empty map (every work then uses its scheme default). */
function loadMap(key: string): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function persistMap(key: string, map: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // Best-effort: a full/blocked localStorage never breaks the editor.
  }
}

/** Reactive stores. `mode`/`granularity` mirror per-work localStorage; reads
 * ALWAYS go through the clamping getters below, never the raw maps, so an
 * illegal persisted value can never reach a view. */
const state = $state({
  mode: loadMap(MODE_KEY) as Record<string, ViewMode | string>,
  granularity: loadMap(GRAN_KEY) as Record<string, InterpolatedGranularity | string>,
});

/**
 * The current, VALIDATED view mode for `workId` under `scheme`. A persisted
 * value wins only when it is still legal for the scheme; otherwise the scheme
 * default. Reactive — reading it inside an effect/derived re-runs on change.
 */
export function currentViewMode(workId: string, scheme: CitationScheme): ViewMode {
  const legal = legalViews(scheme);
  const saved = state.mode[workId];
  if (typeof saved === 'string' && legal.includes(saved as ViewMode)) return saved as ViewMode;
  return defaultView(scheme);
}

/**
 * Set the view mode for `workId`. Ignores an illegal mode for the scheme
 * (guards call sites can't push one) — the toolbar only offers legal modes,
 * but this keeps the store honest even if a stale caller tries.
 */
export function setViewMode(workId: string, scheme: CitationScheme, mode: ViewMode): void {
  if (!legalViews(scheme).includes(mode)) return;
  state.mode = { ...state.mode, [workId]: mode };
  persistMap(MODE_KEY, state.mode as Record<string, string>);
}

/**
 * The current interpolated granularity for `workId` (stubbed hidden this
 * phase — the interpolated view lands later). Validated to a known value,
 * defaulting to `'unit'` (a row's own unit).
 */
export function currentGranularity(workId: string): InterpolatedGranularity {
  const saved = state.granularity[workId];
  if (typeof saved === 'string' && GRANULARITIES.includes(saved as InterpolatedGranularity)) {
    return saved as InterpolatedGranularity;
  }
  return 'unit';
}

/** Set the interpolated granularity for `workId`. */
export function setGranularity(workId: string, granularity: InterpolatedGranularity): void {
  if (!GRANULARITIES.includes(granularity)) return;
  state.granularity = { ...state.granularity, [workId]: granularity };
  persistMap(GRAN_KEY, state.granularity as Record<string, string>);
}
