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
 *  - `check`      — a linguist's diagnosis of the translator's existing English
 *                   against the Greek; the target's own English IS sent.
 *  - `ask`        — a free-form question the translator poses about the TARGET
 *                   line; the AI answers as a helpful classicist assistant,
 *                   grounded in the Greek and surrounding context. The
 *                   question rides in `AssistContext.question`; the target's
 *                   own English IS sent (like `check`), so the translator may
 *                   ask about their own draft.
 */
export type AssistMode = 'translate' | 'reference' | 'check' | 'ask';

/**
 * The translation unit the prompt speaks in (D8 §7 — unit-aware wording).
 * Absent on `AssistContext` = `'line'` (back-compat: every pre-D8 caller is a
 * line-unit caller, and the Bekker prompt strings stay byte-identical):
 *
 *  - `line`       — Bekker / plain-line rows: the shipped wording, unchanged.
 *  - `paragraph`  — paragraph-row para-layer targets (the `englishPara`
 *                   field): target and context rows are whole paragraphs.
 *  - `sentence`   — paragraph-row sentence-layer targets: the target is ONE
 *                   sentence of a paragraph; context rows are the
 *                   neighbouring paragraphs, and `enclosing` carries the
 *                   paragraph the sentence belongs to.
 */
export type AssistUnit = 'line' | 'paragraph' | 'sentence';

export interface AssistContext {
  /** Which task the prompt frames; absent = 'translate' (back-compat). */
  mode?: AssistMode;
  /** The translation unit the prompt speaks in; absent = 'line'. */
  unit?: AssistUnit;
  /** The translator's free-form question. Used ONLY in `ask` mode; ignored
   * (and normally absent) in every other mode. */
  question?: string;
  work: {
    title: string;
    author: string;
    originalLanguage: 'greek' | 'latin';
    /**
     * Human-readable source-language label for the prompt wording.
     * ABSENT (undefined) = back-compat: derived from `originalLanguage`
     * ('greek' → "Greek", 'latin' → "Latin") — corpus works keep their
     * shipped wording byte-identical. A non-empty string (a free work's
     * user-typed language, e.g. "German") is used verbatim. `null` or a
     * blank string = UNKNOWN: the prompts drop the language claim and speak
     * of "the source text" instead.
     */
    language?: string | null;
    scheme: string;
  };
  book: { index: number; label: string };
  chapter: number;
  /**
   * `sentence`-unit targets only: the paragraph the target sentence belongs
   * to (the whole row's source text). Rendered as reading context — never
   * translated, never sent with a draft.
   */
  enclosing?: { address: string; greek: string };
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
