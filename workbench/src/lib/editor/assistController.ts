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
import {
  COPY_DONE_MESSAGE,
  COPY_FAILED_MESSAGE,
  GENERIC_ERROR_MESSAGE,
  NOT_SENT_MESSAGE,
} from '../assist/messages';
import { CliProvider } from '../assist/cliProvider';
import type { RunInvokeFn } from '../assist/cliProvider';
import { ClipboardProvider } from '../assist/clipboardProvider';
import { ApiProvider } from '../assist/apiProvider';
import type { FetchFn } from '../assist/apiProvider';
import type { ApiProviderId } from '../assist/resolveProvider';
import { CLI_TOOLS, CUSTOM_TOOL } from '../assist/tools';
import { resolveAssistProvider } from '../assist/resolveProvider';
import { cliModel } from '../assist/models';
import type { CliProviderId, DetectionMap } from '../assist/resolveProvider';
import { consentPrompt, grantConsent, hasConsent } from '../assist/consent';
import type { ConsentProviderId } from '../assist/consent';
import { updateSettings } from '../settings';
import type { AssistSettings, WorkbenchSettings } from '../settings';

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
  /** `copy`, when present, backs the popover's "Copy prompt" button: it copies
   * the payload and resolves to the sentence to show next. */
  | { kind: 'message'; text: string; copy?: () => Promise<string> };

export interface AssistControllerDeps {
  /** Resolve the provider for this request (settings/detection flow). */
  getProvider(): Promise<AssistProvider>;
  /**
   * Copy the flat clipboard payload for `ctx`; resolves true on success.
   * Run only when the user clicks "Copy prompt" after a CLI error — never on
   * its own, since Universal Clipboard can carry it to other devices.
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
    // A CLI error (or a failure before any provider) offers "Copy prompt".
    let copyable = false;
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

      // The CLI path never writes the clipboard itself (see cliProvider.ts),
      // and neither does this: on its errors the user may copy the prompt.
      copyable = result.kind === 'error' && provider.id === 'cli';
    } catch (err) {
      if (!live()) return; // cancellation surfaces as AbortError — never rendered
      console.error('[assist] request failed', err);
      result = { kind: 'error', message: GENERIC_ERROR_MESSAGE };
      copyable = true;
    }

    if (result.kind === 'suggestion') {
      this.deps.onState({ kind: 'suggestion', text: result.text });
    } else if (copyable) {
      this.deps.onState({ kind: 'message', text: result.message, copy: () => this.copyPrompt(ctx) });
    } else {
      this.deps.onState({ kind: 'message', text: result.message });
    }
  }

  private async copyPrompt(ctx: AssistContext): Promise<string> {
    const copied = await this.deps.copyPayload(ctx).catch(() => false);
    return copied ? COPY_DONE_MESSAGE : COPY_FAILED_MESSAGE;
  }
}

// ── Tauri provider resolution (D7 §Slice C; lazy, first-use only) ──────────

/** `assist_detect`'s answer (src-tauri/src/commands.rs): where Rust finds
 * each built-in CLI, and the custom command the user approved. */
export interface AssistDetection {
  claude: string | null;
  codex: string | null;
  custom: { program: string; args: string[]; prompt_via: 'stdin' | 'arg' } | null;
}

export interface TauriAssistDeps {
  loadSettings(): Promise<WorkbenchSettings>;
  /** invoke('assist_detect') — which CLIs Rust can run. */
  invokeDetect(): Promise<AssistDetection>;
  /** invoke('assist_run', { tool, prompt, timeoutMs, model? }). */
  invokeRun: RunInvokeFn;
  /** Clipboard write for the fallback provider. */
  writeClipboard(text: string): Promise<void>;
  /** Ask the user before a provider's first send; true = Allow. Default: the
   * ConsentDialog, mounted on the page. */
  askConsent?(req: ConsentRequest): Promise<boolean>;
  /** Persist a settings patch (the granted consent). Default: updateSettings. */
  saveSettings?(patch: Partial<WorkbenchSettings>): Promise<unknown>;
}

/** What the consent prompt shows: the provider asked about and the text. */
export interface ConsentRequest {
  provider: ConsentProviderId;
  title: string;
  body: string;
}

/** Mount the consent dialog and resolve with the answer (DOM only). */
async function showConsentDialog(req: ConsentRequest): Promise<boolean> {
  const [{ mount, unmount }, { default: ConsentDialog }] = await Promise.all([
    import('svelte'),
    import('../../components/ConsentDialog.svelte'),
  ]);
  return new Promise((resolve) => {
    const dialog = mount(ConsentDialog, {
      target: document.body,
      props: {
        title: req.title,
        body: req.body,
        onAnswer: (allow: boolean) => {
          void unmount(dialog);
          resolve(allow);
        },
      },
    });
  });
}

/** One open prompt per provider: a second request while it is up waits on
 * the same answer instead of stacking a second dialog. */
const pendingConsent = new Map<ConsentProviderId, Promise<boolean>>();

/** A provider that sends nothing: the user chose Cancel. */
const notSent = (): AssistProvider => ({
  id: 'clipboard',
  suggest: async () => ({ kind: 'error', message: NOT_SENT_MESSAGE }),
});

/**
 * Return `provider` only if the user has allowed `id` to receive text; ask
 * first if not (John 2026-10-03). Allow is stored per provider; Cancel
 * yields a provider that sends nothing.
 */
async function withConsent(
  deps: TauriAssistDeps,
  assist: AssistSettings,
  id: ConsentProviderId,
  provider: AssistProvider,
  customName?: string,
): Promise<AssistProvider> {
  // Detection can take seconds: read the settings again, so a "Take back" or
  // a new choice made meanwhile counts for this request.
  const now = (await deps.loadSettings()).assist ?? {};
  if (now.provider !== assist.provider) return notSent();
  if (hasConsent(now, id)) return provider;
  let answer = pendingConsent.get(id);
  if (!answer) {
    const req: ConsentRequest = {
      provider: id,
      ...consentPrompt(id, {
        includeDraft: now.includeDraft ?? true,
        window: ASSIST_CONTEXT_WINDOW,
        customName,
      }),
    };
    answer = (async () => {
      const allow = await (deps.askConsent ?? showConsentDialog)(req);
      if (allow) {
        try {
          const fresh = (await deps.loadSettings()).assist;
          await (deps.saveSettings ?? updateSettings)({ assist: grantConsent(fresh, id) });
        } catch (err) {
          // This request still goes; the next one asks again.
          console.error('[assist] could not save consent', err);
        }
      }
      return allow;
    })().finally(() => pendingConsent.delete(id));
    pendingConsent.set(id, answer);
  }
  return (await answer) ? provider : notSent();
}

/**
 * The Tauri-side provider flow (D7 multi-provider).
 *
 *   1. settings.assist.provider names an API provider ('openai'|'anthropic'|
 *      'google') → an ApiProvider over the webview's own `fetch` when a
 *      non-empty key is stored for it, else the clipboard floor.
 *   2. Otherwise ask Rust which CLIs it can run (`assist_detect`): the chosen
 *      tool ('claude'|'codex'|'custom'). A custom command counts only when Rust holds the user's
 *      approval of it — a command named in settings.json, which the window
 *      writes, is never run (workbench-design/sandboxing-plan.md).
 *   3. Nothing usable → ClipboardProvider (§12 invisibility; never throws).
 *
 * No provider chosen → the clipboard, whatever is installed. A provider that
 * would send is returned only once the user has allowed it (withConsent).
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
        return withConsent(
          deps,
          prev,
          chosen,
          new ApiProvider({
            service: chosen as ApiProviderId,
            apiKey,
            model: prev.models?.[chosen],
            fetch: globalThis.fetch.bind(globalThis) as FetchFn,
          }),
        );
      }
      return clipboard();
    }

    const found = await deps.invokeDetect();
    const paths: DetectionMap['paths'] = {
      claude: found.claude,
      codex: found.codex,
      custom: found.custom?.program ?? null,
    };
    const choice = resolveAssistProvider(prev, { paths });
    // A saved Gemini choice finds no path (Rust no longer runs Gemini), so it
    // lands on the clipboard; the check keeps the types honest.
    if (choice.kind === 'cli' && choice.tool !== 'gemini') {
      const spec = choice.tool === 'custom' ? CUSTOM_TOOL : CLI_TOOLS[choice.tool];
      const cli = new CliProvider({
        tool: choice.tool,
        parseOutput: spec.parseOutput,
        invoke: deps.invokeRun,
        model: cliModel(choice.tool, prev.models),
      });
      return withConsent(deps, prev, choice.tool, cli, found.custom?.program.split('/').pop());
    }
    return clipboard();
  } catch (err) {
    console.error('[assist] provider resolution failed', err);
    return clipboard();
  }
}
