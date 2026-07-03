/**
 * CliProvider — thin adapter implementing AssistProvider over an injected
 * `invoke` function (D4 divergence A: the CLI call is a Rust
 * `#[tauri::command]`, not a frontend shell invocation — argv is an array,
 * the prompt goes over stdin, Rust owns timeout/kill/redaction).
 *
 * Contract with the Rust side (fixed; implemented elsewhere):
 *
 *   invoke('assist_suggest', { claudePath, system, user, timeoutMs })
 *     => { ok: true; text: string }
 *      | { ok: false; kind: 'unauth' | 'timeout' | 'error' }
 *
 * This module is pure about clipboard: on failure it returns an
 * `{ kind: 'error', message }` result with the right vetted sentence. It is
 * the CALLER (the UI layer) that decides to then run the clipboard fallback
 * — CliProvider never writes to the clipboard itself.
 */

import type { AssistContext, AssistProvider, AssistResult } from './provider';
import { buildAssistPrompt } from './prompt';
import { GENERIC_ERROR_MESSAGE, UNAUTH_MESSAGE } from './messages';

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface AssistSuggestOk {
  ok: true;
  text: string;
}
export interface AssistSuggestFail {
  ok: false;
  kind: 'unauth' | 'timeout' | 'error';
}
export type AssistSuggestResponse = AssistSuggestOk | AssistSuggestFail;

/** The shape of Tauri's `invoke` function, structurally typed (no import-time Tauri dependency). */
export type InvokeFn = (
  cmd: 'assist_suggest',
  args: { claudePath: string; system: string; user: string; timeoutMs: number },
) => Promise<AssistSuggestResponse>;

export interface CliProviderOptions {
  claudePath: string;
  invoke: InvokeFn;
  timeoutMs?: number;
}

export class CliProvider implements AssistProvider {
  readonly id = 'cli' as const;

  private readonly claudePath: string;
  private readonly invoke: InvokeFn;
  private readonly timeoutMs: number;

  constructor(options: CliProviderOptions) {
    this.claudePath = options.claudePath;
    this.invoke = options.invoke;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult> {
    const { system, user } = buildAssistPrompt(ctx);

    const response = await this.invoke('assist_suggest', {
      claudePath: this.claudePath,
      system,
      user,
      timeoutMs: this.timeoutMs,
    });

    // Respect the AbortSignal: ignore late results entirely (no state update,
    // no message) — the caller's one-in-flight rule owns cancellation.
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
