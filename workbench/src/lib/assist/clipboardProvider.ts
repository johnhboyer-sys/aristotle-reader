/**
 * ClipboardProvider — thin adapter implementing AssistProvider over an
 * injected `writeText` function (e.g. @tauri-apps/plugin-clipboard-manager's
 * `writeText`, or a browser-harness stub). Builds the payload via
 * `buildClipboardPayload`, writes it, and returns the vetted plain sentence.
 */

import type { AssistContext, AssistProvider, AssistResult } from './provider';
import { buildClipboardPayload } from './clipboardPayload';
import { COPY_FAILED_MESSAGE, NOT_FOUND_MESSAGE } from './messages';

export interface ClipboardProviderOptions {
  writeText(text: string): Promise<void>;
  /** Message to show on success. Defaults to the "not found" clipboard sentence. */
  message?: string;
}

export class ClipboardProvider implements AssistProvider {
  readonly id = 'clipboard' as const;

  private readonly writeText: (text: string) => Promise<void>;
  private readonly message: string;

  constructor(options: ClipboardProviderOptions) {
    this.writeText = options.writeText;
    this.message = options.message ?? NOT_FOUND_MESSAGE;
  }

  async suggest(ctx: AssistContext, _signal: AbortSignal): Promise<AssistResult> {
    const payload = buildClipboardPayload(ctx);
    try {
      await this.writeText(payload);
    } catch {
      return { kind: 'error', message: COPY_FAILED_MESSAGE };
    }
    return { kind: 'clipboard', message: this.message };
  }
}
