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

import type { AssistContext, AssistProvider, AssistResult, AssistUnit } from '../assist/provider';
import { COPY_FAILED_MESSAGE, GENERIC_ERROR_MESSAGE } from '../assist/messages';
import { CliProvider } from '../assist/cliProvider';
import type { RunInvokeFn } from '../assist/cliProvider';
import { ClipboardProvider } from '../assist/clipboardProvider';
import { ApiProvider } from '../assist/apiProvider';
import type { FetchFn } from '../assist/apiProvider';
import type { ApiProviderId } from '../assist/resolveProvider';
import { CLI_TOOLS, CUSTOM_TOOL } from '../assist/tools';
import { resolveAssistProvider } from '../assist/resolveProvider';
import type { CliProviderId, DetectionMap } from '../assist/resolveProvider';
import type { WorkbenchSettings } from '../settings';

const PARAGRAPH_ASSIST_UNIT: AssistUnit = 'paragraph';

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
  /** The translation unit the prompt speaks in (D8 §7); absent = 'line'. */
  unit?: AssistUnit;
  /**
   * `sentence`-unit targets only: the target SENTENCE's slice of the row's
   * source text. When it is a proper sub-slice of the row, the full row
   * becomes `ctx.enclosing` (the paragraph the sentence belongs to) and the
   * slice becomes the target text. Ignored for other units.
   */
  targetSlice?: string;
  work: AssistContext['work'];
  book: AssistContext['book'];
  chapter: number;
}

/** Pure: rows in, an `AssistContext` out — ±window rows clamped to the
 * chapter, `before` oldest→newest, `after` nearest-first. */
export function buildAssistContext(args: AssistContextArgs): AssistContext {
  const window = args.window ?? ASSIST_CONTEXT_WINDOW;
  const includeDraft = args.includeDraft ?? true;
  const unit = args.unit ?? 'line';
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
  // Sentence-unit slice discipline: the slice is the target text and the
  // whole row rides along as the enclosing paragraph — but only when the
  // slice is real (non-blank) and a PROPER sub-slice (an unsplit row's
  // "slice" is the whole row; no enclosing duplicate then).
  const slice = unit === 'sentence' ? (args.targetSlice ?? '').trim() : '';
  const useSlice = slice.length > 0 && slice !== target.greek.trim();
  return {
    ...(unit !== 'line' ? { unit } : {}),
    work: args.work,
    book: args.book,
    chapter: args.chapter,
    target: { address: target.address, greek: useSlice ? slice : target.greek },
    ...(useSlice ? { enclosing: { address: target.address, greek: target.greek } } : {}),
    before,
    after,
  };
}

// ── the insert transaction (D4's hard constraint) ──────────────────────────

export interface SanitizeSuggestionOptions {
  multiline?: boolean;
}

/**
 * Sentence/Bekker-line suggestions are one physical row, so the default path
 * collapses all whitespace to single spaces. Paragraph-layer suggestions may
 * carry line breaks in PM text nodes; in that mode, CRLF/CR normalize to LF,
 * horizontal whitespace collapses per line, edge blank lines are dropped, and
 * interior blank runs collapse to one LF.
 */
export function sanitizeSuggestion(text: string, opts: SanitizeSuggestionOptions = {}): string {
  if (!opts.multiline) return stripEchoedAddress(text.replace(/\s+/g, ' ').trim());

  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n\r]+/g, ' ').trim());

  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  if (lines.length > 0) lines[0] = stripEchoedAddress(lines[0]);

  return lines.filter((line) => line !== '').join('\n');
}

/**
 * The translate prompt shows the target as `[address] source`, so the model
 * sometimes echoes the leading `[1041a19]` / `[¶1]` token into its answer. Drop
 * a single leading address-like bracket token (short, no spaces) — real English
 * translations don't open with one, so this can't eat genuine output.
 */
function stripEchoedAddress(line: string): string {
  return line.replace(/^\[[^\]\s]{1,24}\]\s*/, '');
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
export function buildInsertTransaction(
  state: EditorState,
  text: string,
  opts: SanitizeSuggestionOptions = {},
): Transaction | null {
  const clean = sanitizeSuggestion(text, opts);
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
        const text = sanitizeSuggestion(result.text, { multiline: ctx.unit === PARAGRAPH_ASSIST_UNIT });
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

// ── Tauri provider resolution (D7 §Slice C; lazy, first-use only) ──────────

/** `assist_detect`'s answer (src-tauri/src/commands.rs): where Rust finds
 * each built-in CLI, and the custom command the user approved. */
export interface AssistDetection {
  claude: string | null;
  codex: string | null;
  gemini: string | null;
  custom: { program: string; args: string[]; prompt_via: 'stdin' | 'arg' } | null;
}

export interface TauriAssistDeps {
  loadSettings(): Promise<WorkbenchSettings>;
  /** invoke('assist_detect') — which CLIs Rust can run. */
  invokeDetect(): Promise<AssistDetection>;
  /** invoke('assist_run', { tool, prompt, timeoutMs }). */
  invokeRun: RunInvokeFn;
  /** Clipboard write for the fallback provider. */
  writeClipboard(text: string): Promise<void>;
}

/**
 * The Tauri-side provider flow (D7 multi-provider).
 *
 *   1. settings.assist.provider names an API provider ('openai'|'anthropic'|
 *      'google') → an ApiProvider over the webview's own `fetch` when a
 *      non-empty key is stored for it, else the clipboard floor.
 *   2. Otherwise ask Rust which CLIs it can run (`assist_detect`): the chosen
 *      tool ('claude'|'codex'|'gemini'|'custom'), or Claude when none is
 *      chosen. A custom command counts only when Rust holds the user's
 *      approval of it — a command named in settings.json, which the window
 *      writes, is never run (workbench-design/sandboxing-plan.md).
 *   3. Nothing usable → ClipboardProvider (§12 invisibility; never throws).
 *
 * No startup probe, no model-call probe — the first real suggestion doubles as
 * the auth test (D4 divergence D).
 */
export async function resolveTauriAssistProvider(deps: TauriAssistDeps): Promise<AssistProvider> {
  const clipboard = () => new ClipboardProvider({ writeText: deps.writeClipboard });
  try {
    const settings = await deps.loadSettings();
    const prev = settings.assist ?? {};
    const chosen = prev.provider;

    if (chosen === 'openai' || chosen === 'anthropic' || chosen === 'google') {
      const apiKey = prev.apiKeys?.[chosen];
      if (apiKey && apiKey.trim()) {
        return new ApiProvider({
          service: chosen as ApiProviderId,
          apiKey,
          model: prev.models?.[chosen],
          fetch: globalThis.fetch.bind(globalThis) as FetchFn,
        });
      }
      return clipboard();
    }

    const found = await deps.invokeDetect();
    const paths: DetectionMap['paths'] = {
      claude: found.claude,
      codex: found.codex,
      gemini: found.gemini,
      custom: found.custom?.program ?? null,
    };
    const choice = resolveAssistProvider(prev, { paths });
    if (choice.kind === 'cli') {
      const spec = choice.tool === 'custom' ? CUSTOM_TOOL : CLI_TOOLS[choice.tool];
      return new CliProvider({ tool: choice.tool, parseOutput: spec.parseOutput, invoke: deps.invokeRun });
    }
    return clipboard();
  } catch (err) {
    console.error('[assist] provider resolution failed', err);
    return clipboard();
  }
}
