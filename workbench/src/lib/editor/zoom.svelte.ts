// Working-text zoom (John): scales the editor's Greek/English body text via a
// `--zoom` CSS multiplier on --work-fs. A display preference, persisted to
// localStorage, shared between the toolbar controls (App shell) and the editor
// that applies the variable. Chrome/UI stays fixed size — only the working
// text scales.

const KEY = 'workbench:zoom';
const MIN = 0.7;
const MAX = 2.4;
const STEP = 0.1;

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, n));
}

/** Round to one decimal so repeated +/- steps don't drift on float error. */
function tidy(n: number): number {
  return Math.round(n * 10) / 10;
}

function load(): number {
  if (typeof localStorage === 'undefined') return 1;
  const raw = Number(localStorage.getItem(KEY));
  return Number.isFinite(raw) && raw > 0 ? clamp(tidy(raw)) : 1;
}

export const zoom = $state({ factor: load() });

function persist() {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, String(zoom.factor));
}

export function zoomIn(): void {
  zoom.factor = clamp(tidy(zoom.factor + STEP));
  persist();
}

export function zoomOut(): void {
  zoom.factor = clamp(tidy(zoom.factor - STEP));
  persist();
}

export function zoomReset(): void {
  zoom.factor = 1;
  persist();
}

export const zoomAtMin = () => zoom.factor <= MIN;
export const zoomAtMax = () => zoom.factor >= MAX;

/** Whole-number percent for the toolbar label (e.g. 1.2 → "120%"). */
export function zoomPercent(): number {
  return Math.round(zoom.factor * 100);
}
