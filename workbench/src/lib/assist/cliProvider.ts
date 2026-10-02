/**
 * CliProvider — AssistProvider over the Rust `assist_run` job
 * (src-tauri/src/commands.rs). The window names the tool and sends the
 * composed prompt; Rust finds the program, builds its arguments (each AI CLI
 * with its own tools switched off), owns the timeout and keeps stderr:
 *
 *   invoke('assist_run', { tool, prompt, timeoutMs })
 *     => { ok: true; text: string }      — the CLI's raw stdout
 *      | { ok: false; kind: 'unauth' | 'timeout' | 'error' }
 *
 * On `ok`, the tool's `parseOutput(text)` maps `{ text }` to a suggestion and
 * `{ error, authLike }` to an error sentence (UNAUTH_MESSAGE when authLike,
 * else GENERIC).
 *
 * This module is pure about clipboard: on failure it returns an
 * `{ kind: 'error', message }` result with the right vetted sentence. It is
 * the CALLER (the UI layer) that decides to then run the clipboard fallback —
 * CliProvider never writes to the clipboard itself.
 */

import type { AssistContext, AssistProvider, AssistResult } from './provider';
import type { CliToolId } from './tools';
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

/** The `assist_run` invoke, structurally typed (no import-time Tauri dependency). */
export type RunInvokeFn = (
  cmd: 'assist_run',
  args: { tool: CliToolId; prompt: string; timeoutMs: number },
) => Promise<AssistRunResponse>;

export interface CliProviderOptions {
  tool: CliToolId;
  parseOutput(stdout: string): ParseResult;
  invoke: RunInvokeFn;
  timeoutMs?: number;
}

/** The one prompt string a CLI receives: system framing, a blank line, then
 * the user context block. Rust delivers it on stdin or as the last argument,
 * as the tool reads it. */
export function composeCliPrompt(ctx: AssistContext): string {
  const { system, user } = buildAssistPrompt(ctx);
  return `${system}\n\n${user}`;
}

export class CliProvider implements AssistProvider {
  readonly id = 'cli' as const;

  private readonly timeoutMs: number;

  constructor(private readonly options: CliProviderOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult> {
    const response = await this.options.invoke('assist_run', {
      tool: this.options.tool,
      prompt: composeCliPrompt(ctx),
      timeoutMs: this.timeoutMs,
    });

    // Respect the AbortSignal: ignore late results entirely.
    if (signal.aborted) {
      return { kind: 'error', message: GENERIC_ERROR_MESSAGE };
    }

    if (!response.ok) {
      return {
        kind: 'error',
        message: response.kind === 'unauth' ? UNAUTH_MESSAGE : GENERIC_ERROR_MESSAGE,
      };
    }

    const parsed = this.options.parseOutput(response.text);
    if ('text' in parsed) {
      return { kind: 'suggestion', text: parsed.text };
    }
    return {
      kind: 'error',
      message: parsed.authLike ? UNAUTH_MESSAGE : GENERIC_ERROR_MESSAGE,
    };
  }
}
