/**
 * AI-assist (design doc D4, build spec §12) — frozen provider types.
 *
 * This module is pure data shape only: no IO, no Tauri, no editor/model
 * coupling. `src/lib/assist/` as a whole is structurally forbidden from
 * importing `editor/model`, `library/storage`, or `chapterfile` — see
 * `__tests__/isolation.test.ts` (D2-style source scan). Addresses in
 * `AssistContext` are OPAQUE raw strings from the row model's citation
 * scheme; nothing in this package ever parses them, only displays them.
 */

/** One context row: a source-language line, its address, and the user's
 * draft English for it (`null` when that row is not yet translated). */
export interface AssistContextRow {
  address: string;
  greek: string;
  english: string | null;
}

/**
 * Which assist task the prompt frames. Optional on `AssistContext` (absent =
 * `'translate'`, for back-compat):
 *
 *  - `translate`  — the FIRST-PASS translation that FILLS the manuscript's
 *                   English cell: strictly line-locked 1:1, output only the
 *                   target line's English, match the surrounding register.
 *  - `reference`  — a natural, faithful, COMPLETE English rendering shown to
 *                   the translator in a floating reference popup; it never
 *                   touches the cell, so it is freed from line-lock.
 */
export type AssistMode = 'translate' | 'reference' | 'check';

export interface AssistContext {
  /** Which task the prompt frames; absent = 'translate' (back-compat). */
  mode?: AssistMode;
  work: {
    title: string;
    author: string;
    originalLanguage: 'greek' | 'latin';
    scheme: string;
  };
  book: { index: number; label: string };
  chapter: number;
  /** The target line. In `translate`/`reference` modes the target carries no
   * `english` (assist never sends the target's own draft when producing a
   * translation). In `check` mode the target's `english` IS sent — it is the
   * translation being diagnosed. */
  target: { address: string; greek: string; english?: string | null };
  /** Rows immediately before the target, oldest to newest. */
  before: AssistContextRow[];
  /** Rows immediately after the target, nearest first. */
  after: AssistContextRow[];
}

/**
 * `suggestion`  — a provider produced English text for the target line.
 * `clipboard`   — the provider's fallback path handled the request itself
 *                 (copied a payload); `message` is the one plain sentence to
 *                 show.
 * `error`       — the provider could not produce a suggestion; `message` is
 *                 ALWAYS a vetted plain sentence (see `messages.ts`), never a
 *                 stack trace, exit code, path, or stderr fragment.
 */
export type AssistResult =
  | { kind: 'suggestion'; text: string }
  | { kind: 'clipboard'; message: string }
  | { kind: 'error'; message: string };

export interface AssistProvider {
  readonly id: 'cli' | 'api' | 'clipboard';
  suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult>;
}
