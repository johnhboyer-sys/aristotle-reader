/**
 * Pure view-model logic for ImportDialog.svelte's preview table (d3 §6).
 *
 * This module owns everything about the preview that has NO dependency on the
 * DOM: turning an `ImportPlan` row into display-ready fields (badge label,
 * quiet/loud, hover note), tracking the user's in-dialog edits (text changes +
 * merge-up/push-down redistribution + orphan assignment/discard), and
 * computing whether the Import button may be enabled. Svelte 5 component code
 * should be a thin binding over this — the logic itself is plain, easily
 * unit-testable TypeScript with no Svelte runtime involved.
 *
 * plan.ts / align.ts / scrivenerMd.ts / parseImportFile.ts are READ-ONLY from
 * here — this module only reads their exported types, never edits them.
 */

import type { ImportPlan, OrphanLine, PlanRow, RowState } from './plan';

// ── row display ────────────────────────────────────────────────────────────

/** Plain-language note shown for a flagged row (hover/inline, d3 §5/§6). No
 * numeric scores ever — the dialog only shows these sentences. */
export const ROW_STATE_NOTES: Record<Exclude<RowState, 'matched'>, string> = {
  'low-confidence':
    "This line's match to the standard text isn't certain — compare the Greek and check the English.",
  split:
    "We guessed how to spread text across these lines — drag or move text between rows to fix.",
  merged: 'Two or more of the imported lines were combined onto this one row.',
  'no-source': "No imported line matched this row — it's empty; add the English by hand.",
};

/** Short badge label for a row's state (never a numeric score). */
export const ROW_STATE_LABELS: Record<RowState, string> = {
  matched: '✓',
  'low-confidence': '⚠ low confidence',
  split: '⚠ split',
  merged: '⚠ merged',
  'no-source': '⚠ no source',
};

/** A preview row with the user's live edits layered over the plan's proposal. */
export interface PreviewRow {
  index: number;
  address: string;
  spineGreek: string;
  userGreek?: string;
  english: string;
  state: RowState;
  flagged: boolean;
  /** True once the user has directly edited this row's English (clears `split`
   * display per the build brief: "edits clear a row's split flag once the
   * user has touched that segment"). */
  touched: boolean;
}

/** A preview-side orphan with its resolution state. */
export interface PreviewOrphan extends OrphanLine {
  /** Row address the user assigned this orphan's English to, or null (unresolved). */
  assignedTo: string | null;
  /** True once the user chose "discard". */
  discarded: boolean;
}

/** The full mutable preview state the dialog binds to. */
export interface PreviewState {
  rows: PreviewRow[];
  orphans: PreviewOrphan[];
}

/** Build the initial (untouched) preview state from a resolved plan. */
export function buildPreviewState(plan: ImportPlan): PreviewState {
  return {
    rows: plan.rows.map((r, index) => rowToPreview(r, index)),
    orphans: plan.orphans.map((o) => ({ ...o, assignedTo: null, discarded: false })),
  };
}

function rowToPreview(r: PlanRow, index: number): PreviewRow {
  const row: PreviewRow = {
    index,
    address: r.address,
    spineGreek: r.spineGreek,
    english: r.proposedEnglish,
    state: r.state,
    flagged: r.flagged,
    touched: false,
  };
  if (r.userGreek !== undefined) row.userGreek = r.userGreek;
  return row;
}

// ── editing ────────────────────────────────────────────────────────────────

/**
 * Apply a direct text edit to a row's English. Touching a row clears its
 * `split` flag (the user has confirmed/rewritten that segment) — other flag
 * kinds (low-confidence, merged, no-source) are informational about
 * PROVENANCE, not about whether the text is right, so they persist until the
 * row is otherwise resolved; only `split`'s "we guessed the boundary" concern
 * is retired by a direct edit. `no-source` becomes `matched` once the row has
 * non-empty text (there's a source now: the user).
 */
export function editRowText(state: PreviewState, index: number, text: string): PreviewState {
  const rows = state.rows.map((row) => {
    if (row.index !== index) return row;
    const wasEmpty = row.state === 'no-source';
    const next: PreviewRow = { ...row, english: text, touched: true };
    if (row.state === 'split' || (wasEmpty && text.trim().length > 0)) {
      next.state = 'matched';
      next.flagged = false;
    }
    return next;
  });
  return { ...state, rows };
}

/**
 * Move a row's ENTIRE English text into the previous row (merging it there)
 * and clear this row's own text — the cheap, honest alternative to
 * drag-and-drop redistribution. No-op at row 0. Both rows are marked touched;
 * the destination row's `split` flag clears (its text is now user-confirmed),
 * this row becomes an explicit (touched) empty cell.
 */
export function mergeIntoPrevious(state: PreviewState, index: number): PreviewState {
  if (index <= 0) return state;
  const src = state.rows[index];
  const dstIndex = index - 1;
  const rows = state.rows.map((row) => {
    if (row.index === dstIndex) {
      const joined = [row.english, src.english].filter((t) => t.trim().length > 0).join(' ');
      return { ...row, english: joined, touched: true, state: 'matched' as RowState, flagged: false };
    }
    if (row.index === index) {
      return { ...row, english: '', touched: true, state: 'matched' as RowState, flagged: false };
    }
    return row;
  });
  return { ...state, rows };
}

/**
 * Move a row's ENTIRE English text into the next row and clear this row's own
 * text. No-op on the last row. Mirror of `mergeIntoPrevious`.
 */
export function pushToNext(state: PreviewState, index: number): PreviewState {
  if (index >= state.rows.length - 1) return state;
  const src = state.rows[index];
  const dstIndex = index + 1;
  const rows = state.rows.map((row) => {
    if (row.index === dstIndex) {
      const joined = [src.english, row.english].filter((t) => t.trim().length > 0).join(' ');
      return { ...row, english: joined, touched: true, state: 'matched' as RowState, flagged: false };
    }
    if (row.index === index) {
      return { ...row, english: '', touched: true, state: 'matched' as RowState, flagged: false };
    }
    return row;
  });
  return { ...state, rows };
}

// ── orphans ────────────────────────────────────────────────────────────────

/** Assign an orphan's English text onto a row (appended, so nothing already
 * there is lost) and mark the orphan resolved. */
export function assignOrphan(state: PreviewState, importIndex: number, address: string): PreviewState {
  const orphans = state.orphans.map((o) =>
    o.importIndex === importIndex ? { ...o, assignedTo: address, discarded: false } : o,
  );
  const rows = state.rows.map((row) => {
    if (row.address !== address) return row;
    const orphan = state.orphans.find((o) => o.importIndex === importIndex);
    if (!orphan) return row;
    const joined = [row.english, orphan.english].filter((t) => t.trim().length > 0).join(' ');
    return { ...row, english: joined, touched: true, state: 'matched' as RowState, flagged: false };
  });
  return { rows, orphans };
}

/** Discard an orphan's text (it never lands anywhere). */
export function discardOrphan(state: PreviewState, importIndex: number): PreviewState {
  const orphans = state.orphans.map((o) =>
    o.importIndex === importIndex ? { ...o, discarded: true, assignedTo: null } : o,
  );
  return { ...state, orphans };
}

/** Undo a resolution — back to unresolved (used if the user picks a
 * different row after already assigning, or wants to reconsider a discard). */
export function unresolveOrphan(state: PreviewState, importIndex: number): PreviewState {
  const orphan = state.orphans.find((o) => o.importIndex === importIndex);
  if (!orphan) return state;
  let rows = state.rows;
  if (orphan.assignedTo) {
    const addr = orphan.assignedTo;
    rows = state.rows.map((row) => {
      if (row.address !== addr) return row;
      // Best-effort removal: strip the trailing " <orphan text>" this
      // assignment appended. If the row was hand-edited since, leave it be
      // (the user's edit wins — we never silently claw text back).
      const suffix = orphan.english.trim();
      if (suffix && row.english.endsWith(suffix)) {
        const stripped = row.english.slice(0, row.english.length - suffix.length).trimEnd();
        return { ...row, english: stripped };
      }
      return row;
    });
  }
  const orphans = state.orphans.map((o) =>
    o.importIndex === importIndex ? { ...o, assignedTo: null, discarded: false } : o,
  );
  return { rows, orphans };
}

/** True while an orphan is neither assigned nor discarded. */
export function isOrphanUnresolved(o: PreviewOrphan): boolean {
  return o.assignedTo === null && !o.discarded;
}

// ── import-button gating ──────────────────────────────────────────────────

export interface ImportGate {
  enabled: boolean;
  /** One plain sentence explaining why Import is disabled; null when enabled. */
  reason: string | null;
}

/**
 * Whether the Import button may be enabled, and the one-line reason when it
 * can't (build brief item 4): blocked while any orphan is unresolved or the
 * plan itself is `blocked` (d3 §5/§6 — "the Import button is disabled while
 * any orphan is unresolved").
 */
export function importGate(plan: ImportPlan, preview: PreviewState): ImportGate {
  const unresolved = preview.orphans.filter(isOrphanUnresolved).length;
  if (unresolved > 0) {
    return {
      enabled: false,
      reason:
        unresolved === 1
          ? "One imported line didn't match anywhere — assign it to a row or discard it before importing."
          : `${unresolved} imported lines didn't match anywhere — assign or discard each before importing.`,
    };
  }
  if (plan.blocked) {
    return { enabled: false, reason: 'This chapter has unresolved problems and can’t be imported yet.' };
  }
  return { enabled: true, reason: null };
}

// ── chapter-level banner ───────────────────────────────────────────────────

/** Fraction of rows currently flagged (recomputed live as the user edits, so
 * resolving rows lowers it). Mirrors plan.ts's `flaggedFraction` semantics. */
export function flaggedFraction(state: PreviewState): number {
  if (state.rows.length === 0) return 0;
  const flagged = state.rows.filter((r) => r.flagged).length;
  return flagged / state.rows.length;
}

/** Threshold above which the d3 §5 review banner shows. */
export const REVIEW_BANNER_THRESHOLD = 0.25;

export const REVIEW_BANNER_MESSAGE =
  "This chapter's lines didn't line up cleanly with the standard text — review carefully before importing.";

// ── applying the preview back onto a plan (for buildChapterFile) ──────────

/**
 * Produce a plan identical to `plan` except each row's `proposedEnglish`
 * reflects the user's edits. `buildChapterFile` (plan.ts, read-only) consumes
 * this directly — the dialog never re-implements chapter-file assembly.
 */
export function applyPreviewToPlan(plan: ImportPlan, preview: PreviewState): ImportPlan {
  const rows: PlanRow[] = plan.rows.map((r, i) => {
    const pr = preview.rows[i];
    if (!pr) return r;
    return { ...r, proposedEnglish: pr.english };
  });
  return { ...plan, rows };
}
