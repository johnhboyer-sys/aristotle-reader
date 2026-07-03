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

export interface AssistContext {
  work: {
    title: string;
    author: string;
    originalLanguage: 'greek' | 'latin';
    scheme: string;
  };
  book: { index: number; label: string };
  chapter: number;
  /** The line to translate. Target rows never carry an `english` field —
   * assist never sends or receives draft English for the target itself. */
  target: { address: string; greek: string };
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
