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
import { CliProvider, buildCliInvocation } from '../assist/cliProvider';
import type { RunInvokeFn } from '../assist/cliProvider';
import { ClipboardProvider } from '../assist/clipboardProvider';
import { ApiProvider } from '../assist/apiProvider';
import type { FetchFn } from '../assist/apiProvider';
import type { ApiProviderId } from '../assist/resolveProvider';
import { resolveToolBinary } from '../assist/detect';
import { CLI_TOOLS, specForCustom } from '../assist/tools';
import type { CliToolSpec } from '../assist/tools';
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

export interface TauriAssistDeps {
  loadSettings(): Promise<WorkbenchSettings>;
  updateSettings(patch: Partial<WorkbenchSettings>): Promise<unknown>;
  /** plugin-fs exists() on an absolute path; a throw counts as "not there". */
  exists(path: string): Promise<boolean>;
  /** $HOME (@tauri-apps/api path.homeDir — may carry a trailing slash). */
  home(): Promise<string>;
  /** invoke('assist_run', …) — the generalized Rust exec command (Slice B). */
  invokeRun: RunInvokeFn;
  /** invoke('assist_which', { candidates, binName }) — the Rust login-shell rung (Slice B). */
  invokeWhich(candidates: string[], binName: string): Promise<string | null>;
  /** Clipboard write for the fallback provider. */
  writeClipboard(text: string): Promise<void>;
}

/** The built-in CLI tools we auto-detect, in preference order (claude first). */
const DETECT_ORDER: readonly ('claude' | 'codex' | 'gemini')[] = ['claude', 'codex', 'gemini'];

/**
 * The Tauri-side provider flow (D7 multi-provider).
 *
 *   1. Determine the chosen provider from settings.assist.provider:
 *      - a CLI tool ('claude'|'codex'|'gemini'|'custom') → use it directly.
 *      - unset → DETECT: resolve each built-in tool's binary (via the fixed
 *        candidate ladder + the Rust `assist_which` login-shell rung), prefer
 *        claude, else the first detected. resolveAssistProvider makes the call.
 *      - an API provider ('openai'|'anthropic'|'google') → Slice D: if a
 *        non-empty api key is stored for it, build an ApiProvider over the
 *        webview's own `fetch` (direct pay-per-use call, billed to the user);
 *        with no key, fall through to the clipboard floor.
 *   2. For a resolved CLI tool: resolve its binPath (cached path that still
 *      exists is reused; otherwise resolve via the ladder and cache it), then
 *      build a per-request run-mode CliProvider against `assist_run`.
 *   3. Nothing usable → ClipboardProvider (§12 invisibility; never throws).
 *
 * No startup probe, no model-call probe — the first real suggestion doubles as
 * the auth test (D4 divergence D).
 */
export async function resolveTauriAssistProvider(deps: TauriAssistDeps): Promise<AssistProvider> {
  const clipboard = () => new ClipboardProvider({ writeText: deps.writeClipboard });
  try {
    const safeExists = (p: string) => deps.exists(p).catch(() => false);
    const home = (await deps.home()).replace(/\/+$/, '');
    const settings = await deps.loadSettings();
    const prev = settings.assist ?? {};
    const chosen = prev.provider;

    // API providers (Slice D): build an ApiProvider only when a non-empty key
    // is stored for the chosen service; otherwise the clipboard floor.
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

    // The tool spec for the chosen (or to-be-detected) CLI tool.
    const specFor = (tool: CliProviderId): CliToolSpec =>
      tool === 'custom' ? specForCustom(prev.custom) : CLI_TOOLS[tool];

    // Resolve a tool's absolute binary path, reusing a still-valid cached path
    // (built-in tools only; custom's path comes straight from its spec). The
    // cached-path short-circuit uses plugin-fs `exists`, which fails for the
    // SYMLINKED CLIs that matter (~/.local/bin/claude, /opt/homebrew/bin/codex)
    // on a Finder-launched .app — but that only means the short-circuit is
    // skipped and we re-resolve via resolveToolBinary (whose Rust
    // `assist_which` rung IS symlink-safe), so it still resolves correctly.
    // The re-cache write is gated on an ACTUAL change so a symlink tool that
    // re-resolves to the same path every request doesn't churn settings.
    const resolveBin = async (tool: CliProviderId): Promise<string | null> => {
      const cached = tool !== 'custom' ? prev.cliPaths?.[tool] : undefined;
      if (cached && (await safeExists(cached))) return cached;
      const path = await resolveToolBinary(specFor(tool), {
        exists: safeExists,
        home,
        invokeWhich: (candidates, binName) =>
          deps.invokeWhich(candidates, binName).catch(() => null),
      });
      // Cache newly-resolved built-in paths (custom has no cache slot); skip
      // the write when the resolved path is unchanged from the cache.
      if (path && tool !== 'custom' && path !== cached) {
        await deps.updateSettings({
          assist: { ...prev, cliPaths: { ...prev.cliPaths, [tool]: path } },
        });
      }
      return path;
    };

    // Build the detection map: the chosen tool if explicit, else every built-in
    // (so resolveAssistProvider can prefer claude / pick the first detected).
    const paths: DetectionMap['paths'] = {};
    if (chosen === 'claude' || chosen === 'codex' || chosen === 'gemini' || chosen === 'custom') {
      paths[chosen] = await resolveBin(chosen);
    } else {
      for (const tool of DETECT_ORDER) {
        const p = await resolveBin(tool);
        if (p) {
          paths[tool] = p;
          break; // prefer the first in DETECT_ORDER (claude first)
        }
      }
    }

    const choice = resolveAssistProvider(prev, { paths });
    if (choice.kind === 'cli') {
      return makeRequestCliProvider(specFor(choice.tool), choice.binPath, deps.invokeRun);
    }
    // API providers were handled above (key → ApiProvider, else floor); any
    // remaining non-cli choice is 'clipboard' → the floor.
    return clipboard();
  } catch (err) {
    console.error('[assist] provider resolution failed', err);
    return clipboard();
  }
}

/**
 * A CliProvider whose argv/stdin are recomposed from the tool spec on EVERY
 * suggest call (the composition depends on the per-request AssistContext). The
 * run-mode CliProvider takes a fixed {args, stdin}, so we wrap it in a tiny
 * AssistProvider that builds a fresh CliProvider per request.
 */
function makeRequestCliProvider(
  spec: CliToolSpec,
  binPath: string,
  invokeRun: RunInvokeFn,
): AssistProvider {
  return {
    id: 'cli',
    async suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult> {
      const { args, stdin } = buildCliInvocation(spec, ctx);
      const provider = new CliProvider({
        binPath,
        args,
        stdin,
        parseOutput: spec.parseOutput,
        invoke: invokeRun,
      });
      return provider.suggest(ctx, signal);
    },
  };
}
