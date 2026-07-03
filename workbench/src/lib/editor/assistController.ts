// AI-assist orchestration for the row-lock editor (design doc D4, build spec
// §12) — the UI-slice glue between ChapterEditor and the frozen pure library
// in src/lib/assist/. Everything here is either pure (context assembly, the
// insert transaction, suggestion sanitizing) or dependency-injected (the
// request controller, the Tauri provider resolution flow), so the whole flow
// runs under vitest's node environment with FakeProvider — no DOM, no Tauri.
//
// Dependency direction: editor → assist ONLY. src/lib/assist/** never imports
// from the editor (enforced by its isolation source-scan test); this module
// is the one place the two meet.

import { TextSelection } from '@tiptap/pm/state';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';

import type { AssistContext, AssistProvider, AssistResult } from '../assist/provider';
import { COPY_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE } from '../assist/messages';
import { CliProvider } from '../assist/cliProvider';
import type { InvokeFn } from '../assist/cliProvider';
import { ClipboardProvider } from '../assist/clipboardProvider';
import { resolveClaudeBinary } from '../assist/detect';
import type { WorkbenchSettings } from '../settings';

// ── draft extraction ────────────────────────────────────────────────────────

/**
 * A row doc as plain text for prompt context: marks stripped, footnote
 * markers contribute nothing (empty leafText). `null` when the row is empty
 * or whitespace-only — the prompt renders that as `(untranslated)`.
 */
export function plainRowText(doc: PMNode): string | null {
  const text = doc.textBetween(0, doc.content.size, undefined, '').trim();
  return text.length === 0 ? null : text;
}

// ── context assembly (D4 §3c; John: ±6 rows, draft included by default) ────

export const ASSIST_CONTEXT_WINDOW = 6;

export interface AssistContextArgs {
  rowCount: number;
  /** Address is the row's OPAQUE raw string; never parsed downstream. */
  rowAt(i: number): { address: string; greek: string };
  /**
   * Plain-text draft English for row `i` (null when untranslated). Only ever
   * called for CONTEXT rows — never for the target (structural guarantee:
   * the target's own draft is never sent, per the provider contract).
   */
  draftAt(i: number): string | null;
  targetIndex: number;
  /** John's default-include decision; false renders every context row as
   * untranslated (draftAt is not called at all). */
  includeDraft?: boolean;
  window?: number;
  work: AssistContext['work'];
  book: AssistContext['book'];
  chapter: number;
}

/** Pure: rows in, an `AssistContext` out — ±window rows clamped to the
 * chapter, `before` oldest→newest, `after` nearest-first. */
export function buildAssistContext(args: AssistContextArgs): AssistContext {
  const window = args.window ?? ASSIST_CONTEXT_WINDOW;
  const includeDraft = args.includeDraft ?? true;
  const lo = Math.max(0, args.targetIndex - window);
  const hi = Math.min(args.rowCount - 1, args.targetIndex + window);

  const contextRow = (i: number) => {
    const { address, greek } = args.rowAt(i);
    return { address, greek, english: includeDraft ? args.draftAt(i) : null };
  };

  const before = [];
  for (let i = lo; i < args.targetIndex; i++) before.push(contextRow(i));
  const after = [];
  for (let i = args.targetIndex + 1; i <= hi; i++) after.push(contextRow(i));

  const target = args.rowAt(args.targetIndex);
  return {
    work: args.work,
    book: args.book,
    chapter: args.chapter,
    target: { address: target.address, greek: target.greek },
    before,
    after,
  };
}

// ── the insert transaction (D4's hard constraint) ──────────────────────────

/**
 * A row is one Bekker line: newlines are unrepresentable in the schema, so
 * any multi-line/whitespace-decorated model output collapses to single
 * spaces before it can reach a document.
 */
export function sanitizeSuggestion(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Build THE assist→editor transaction (John-approved semantics): empty row →
 * the text becomes the row's content; selection → replaced; otherwise →
 * inserted at the caret. All three are the selection-replace of a mark-free
 * text node (an empty row's selection is 0..0, a caret is from==to). Plain
 * text, default marks — storedMarks (e.g. Greek mode) are NOT applied.
 * Caret lands after the inserted text. `noCoalesce` keeps it its own
 * app-level undo entry. Returns null when the sanitized text is empty.
 *
 * The caller dispatches this through the row view's normal dispatch — the
 * EXACT same pipeline as typing (app undo stack, dirty tracking,
 * commit-on-idle). No other editor surface exists for assist.
 */
export function buildInsertTransaction(state: EditorState, text: string): Transaction | null {
  const clean = sanitizeSuggestion(text);
  if (clean.length === 0) return null;
  const node = state.schema.text(clean); // no marks — plain text by construction
  const { from, to } = state.selection;
  const tr = state.tr.replaceWith(from, to, node);
  tr.setSelection(TextSelection.create(tr.doc, Math.min(from + node.nodeSize, tr.doc.content.size)));
  tr.setMeta('noCoalesce', true);
  return tr;
}

// ── the request controller (one in-flight, stale results never render) ─────

export type AssistUiState =
  | { kind: 'thinking' }
  | { kind: 'suggestion'; text: string }
  | { kind: 'message'; text: string };

export interface AssistControllerDeps {
  /** Resolve the provider for this request (settings/detection flow). */
  getProvider(): Promise<AssistProvider>;
  /**
   * Copy the flat clipboard payload for `ctx`; resolves true on success.
   * Run when the CLI path errors — D4's rule that the worst case always
   * leaves the payload on the clipboard.
   */
  copyPayload(ctx: AssistContext): Promise<boolean>;
  /** UI sink. Never called for a canceled or superseded request. */
  onState(state: AssistUiState): void;
}

export class AssistController {
  private abortCtl: AbortController | null = null;
  private seq = 0;

  constructor(private readonly deps: AssistControllerDeps) {}

  /** Abort any in-flight request; its result becomes unrenderable. */
  cancel(): void {
    this.seq++;
    this.abortCtl?.abort();
    this.abortCtl = null;
  }

  /** One in-flight request max: invoking again aborts the prior request. */
  async request(ctx: AssistContext): Promise<void> {
    this.cancel();
    const seq = this.seq;
    const abort = new AbortController();
    this.abortCtl = abort;
    const live = () => seq === this.seq && !abort.signal.aborted;

    this.deps.onState({ kind: 'thinking' });

    let result: AssistResult;
    try {
      const provider = await this.deps.getProvider();
      if (!live()) return;
      result = await provider.suggest(ctx, abort.signal);
      if (!live()) return;

      if (result.kind === 'suggestion') {
        const text = sanitizeSuggestion(result.text);
        result = text
          ? { kind: 'suggestion', text }
          : { kind: 'error', message: GENERIC_ERROR_MESSAGE }; // empty output → error path
      }

      // The CLI path never writes the clipboard itself (see cliProvider.ts):
      // on ANY of its errors the caller runs the clipboard fallback so the
      // vetted "copied…" sentences stay true.
      if (result.kind === 'error' && provider.id === 'cli') {
        const copied = await this.deps.copyPayload(ctx);
        if (!live()) return;
        if (!copied) result = { kind: 'error', message: COPY_FAILED_MESSAGE };
      }
    } catch (err) {
      if (!live()) return; // cancellation surfaces as AbortError — never rendered
      console.error('[assist] request failed', err);
      const copied = await this.deps.copyPayload(ctx).catch(() => false);
      if (!live()) return;
      result = { kind: 'error', message: copied ? GENERIC_ERROR_MESSAGE : COPY_FAILED_MESSAGE };
    }

    if (result.kind === 'suggestion') {
      this.deps.onState({ kind: 'suggestion', text: result.text });
    } else {
      this.deps.onState({ kind: 'message', text: result.message });
    }
  }
}

// ── Tauri provider resolution (D4 §1b/§5c; lazy, first-use only) ───────────

export interface TauriAssistDeps {
  loadSettings(): Promise<WorkbenchSettings>;
  updateSettings(patch: Partial<WorkbenchSettings>): Promise<unknown>;
  /** plugin-fs exists() on an absolute path; a throw counts as "not there". */
  exists(path: string): Promise<boolean>;
  /** $HOME (@tauri-apps/api path.homeDir — may carry a trailing slash). */
  home(): Promise<string>;
  /** The real Tauri invoke, for `assist_suggest`. */
  invokeSuggest: InvokeFn;
  /** invoke('assist_resolve_claude') — the Rust login-shell last rung. */
  invokeResolve(): Promise<string | null>;
  /** Clipboard write for the fallback provider. */
  writeClipboard(text: string): Promise<void>;
}

/**
 * The Tauri-side provider flow: cached `assist.cliPath` that still exists →
 * CliProvider; otherwise run the resolution ladder once, cache the outcome
 * in settings (path + state), and fall back to the clipboard floor when
 * nothing resolves. No startup probe, no model-call probe — the first real
 * suggestion doubles as the auth test (D4 divergence D).
 */
export async function resolveTauriAssistProvider(deps: TauriAssistDeps): Promise<AssistProvider> {
  const safeExists = (p: string) => deps.exists(p).catch(() => false);
  const settings = await deps.loadSettings();
  const prev = settings.assist ?? {};

  if (prev.cliPath && (await safeExists(prev.cliPath))) {
    return new CliProvider({ claudePath: prev.cliPath, invoke: deps.invokeSuggest });
  }

  let resolved: string | null = null;
  try {
    const home = (await deps.home()).replace(/\/+$/, '');
    resolved = await resolveClaudeBinary({
      exists: safeExists,
      home,
      invokeResolve: () => deps.invokeResolve().catch(() => null),
    });
  } catch (err) {
    console.error('[assist] claude binary resolution failed', err);
  }

  if (resolved) {
    await deps.updateSettings({
      assist: { ...prev, cliPath: resolved, cliState: 'ok', checkedAt: Date.now() },
    });
    return new CliProvider({ claudePath: resolved, invoke: deps.invokeSuggest });
  }

  await deps.updateSettings({
    assist: { ...prev, cliPath: undefined, cliState: 'not-found', checkedAt: Date.now() },
  });
  return new ClipboardProvider({ writeText: deps.writeClipboard });
}
