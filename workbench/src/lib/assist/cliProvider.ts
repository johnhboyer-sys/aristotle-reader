/**
 * CliProvider — thin adapter implementing AssistProvider over an injected
 * `invoke` function (D4 divergence A / D7 §Slice A: the CLI call is a Rust
 * `#[tauri::command]`, not a frontend shell invocation — argv is an array,
 * the prompt goes over stdin or as a single argv element under execve, Rust
 * owns timeout/kill/redaction).
 *
 * This provider supports two constructor shapes:
 *
 *  1. The generalized D7 shape (preferred), keyed to the fixed `assist_run`
 *     contract:
 *
 *       invoke('assist_run', { binPath, args, stdin, timeoutMs })
 *         => { ok: true; text: string }
 *          | { ok: false; kind: 'unauth' | 'timeout' | 'error' }
 *
 *     The caller composes stdin-vs-arg per the tool spec (see
 *     `buildCliInvocation`) and supplies the spec's `parseOutput`. On `ok`,
 *     `parseOutput(text)` maps `{ text }`→suggestion and `{ error, authLike }`
 *     →an error message (UNAUTH_MESSAGE when authLike, else GENERIC).
 *
 *  2. The legacy d4 shape, kept for the editor's assistController and its
 *     tests, keyed to the older `assist_suggest` contract:
 *
 *       invoke('assist_suggest', { claudePath, system, user, timeoutMs })
 *         => { ok: true; text } | { ok: false; kind }
 *
 *     Here the Rust side already returns the parsed `result` text, so there is
 *     no parseOutput step.
 *
 * This module is pure about clipboard: on failure it returns an
 * `{ kind: 'error', message }` result with the right vetted sentence. It is
 * the CALLER (the UI layer) that decides to then run the clipboard fallback —
 * CliProvider never writes to the clipboard itself.
 */

import type { AssistContext, AssistProvider, AssistResult } from './provider';
import type { CliToolSpec } from './tools';
import type { ParseResult } from './parse';
import { buildAssistPrompt } from './prompt';
import { GENERIC_ERROR_MESSAGE, UNAUTH_MESSAGE } from './messages';

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface AssistRunOk {
  ok: true;
  text: string;
}
export interface AssistRunFail {
  ok: false;
  kind: 'unauth' | 'timeout' | 'error';
}
export type AssistRunResponse = AssistRunOk | AssistRunFail;

// Legacy aliases (the older `assist_suggest` response used the same shape).
export type AssistSuggestOk = AssistRunOk;
export type AssistSuggestFail = AssistRunFail;
export type AssistSuggestResponse = AssistRunResponse;

/** The generalized `assist_run` invoke, structurally typed (no import-time Tauri dependency). */
export type RunInvokeFn = (
  cmd: 'assist_run',
  args: { binPath: string; args: string[]; stdin: string | null; timeoutMs: number },
) => Promise<AssistRunResponse>;

/** The legacy `assist_suggest` invoke, kept for the editor's assistController. */
export type InvokeFn = (
  cmd: 'assist_suggest',
  args: { claudePath: string; system: string; user: string; timeoutMs: number },
) => Promise<AssistSuggestResponse>;

/** Generalized (D7) options: a resolved binary + composed argv/stdin + a parser. */
export interface CliProviderRunOptions {
  binPath: string;
  args: string[];
  /** The composed prompt when promptVia is 'stdin'; null when the prompt is in `args`. */
  stdin: string | null;
  parseOutput(stdout: string): ParseResult;
  invoke: RunInvokeFn;
  timeoutMs?: number;
}

/** Legacy (d4) options: a claude path + the older assist_suggest invoke. */
export interface CliProviderLegacyOptions {
  claudePath: string;
  invoke: InvokeFn;
  timeoutMs?: number;
}

export type CliProviderOptions = CliProviderRunOptions | CliProviderLegacyOptions;

function isLegacy(o: CliProviderOptions): o is CliProviderLegacyOptions {
  return 'claudePath' in o;
}

/**
 * Compose the argv + stdin for a CLI invocation from a tool spec and the assist
 * context. Returns only `{ args, stdin }` — the resolved `binPath` is threaded
 * separately by the caller (resolution is a distinct step from prompt
 * composition). For promptVia 'stdin': stdin = the composed prompt, args =
 * spec.args unchanged. For promptVia 'arg': stdin = null, args =
 * [...spec.args, composedPrompt].
 */
export function buildCliInvocation(
  spec: CliToolSpec,
  ctx: AssistContext,
): { args: string[]; stdin: string | null } {
  const { system, user } = buildAssistPrompt(ctx);
  // One composed prompt string (system framing + the user context block). Both
  // channels carry the same text; only the delivery differs.
  const composed = `${system}\n\n${user}`;
  if (spec.promptVia === 'arg') {
    return { args: [...spec.args, composed], stdin: null };
  }
  return { args: [...spec.args], stdin: composed };
}

export class CliProvider implements AssistProvider {
  readonly id = 'cli' as const;

  private readonly timeoutMs: number;
  private readonly legacy: CliProviderLegacyOptions | null;
  private readonly run: CliProviderRunOptions | null;

  constructor(options: CliProviderLegacyOptions);
  constructor(options: CliProviderRunOptions);
  constructor(options: CliProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (isLegacy(options)) {
      this.legacy = options;
      this.run = null;
    } else {
      this.legacy = null;
      this.run = options;
    }
  }

  async suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult> {
    if (this.legacy) {
      return this.suggestLegacy(this.legacy, ctx, signal);
    }
    // this.run is non-null when legacy is null (constructor invariant).
    return this.suggestRun(this.run as CliProviderRunOptions, ctx, signal);
  }

  private async suggestRun(
    opts: CliProviderRunOptions,
    ctx: AssistContext,
    signal: AbortSignal,
  ): Promise<AssistResult> {
    const response = await opts.invoke('assist_run', {
      binPath: opts.binPath,
      args: opts.args,
      stdin: opts.stdin,
      timeoutMs: this.timeoutMs,
    });

    if (signal.aborted) {
      return { kind: 'error', message: GENERIC_ERROR_MESSAGE };
    }

    if (!response.ok) {
      return {
        kind: 'error',
        message: response.kind === 'unauth' ? UNAUTH_MESSAGE : GENERIC_ERROR_MESSAGE,
      };
    }

    const parsed = opts.parseOutput(response.text);
    if ('text' in parsed) {
      return { kind: 'suggestion', text: parsed.text };
    }
    return {
      kind: 'error',
      message: parsed.authLike ? UNAUTH_MESSAGE : GENERIC_ERROR_MESSAGE,
    };
  }

  private async suggestLegacy(
    opts: CliProviderLegacyOptions,
    ctx: AssistContext,
    signal: AbortSignal,
  ): Promise<AssistResult> {
    const { system, user } = buildAssistPrompt(ctx);

    const response = await opts.invoke('assist_suggest', {
      claudePath: opts.claudePath,
      system,
      user,
      timeoutMs: this.timeoutMs,
    });

    // Respect the AbortSignal: ignore late results entirely.
    if (signal.aborted) {
      return { kind: 'error', message: GENERIC_ERROR_MESSAGE };
    }

    if (response.ok) {
      return { kind: 'suggestion', text: response.text };
    }

    if (response.kind === 'unauth') {
      return { kind: 'error', message: UNAUTH_MESSAGE };
    }

    return { kind: 'error', message: GENERIC_ERROR_MESSAGE };
  }
}
