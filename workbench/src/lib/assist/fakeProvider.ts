/**
 * FakeProvider — a canned AssistProvider for UI tests (D4 §6, "Testing
 * strategy"). Drives every UI test with a canned suggestion / canned error /
 * canned clipboard result and an optional artificial delay, so the
 * Thinking…/cancel path can be exercised deterministically without any real
 * subprocess or clipboard.
 */

import type { AssistContext, AssistProvider, AssistResult } from './provider';

export interface FakeProviderOptions {
  id?: 'cli' | 'api' | 'clipboard';
  /** The result to resolve with once the (optional) delay elapses. */
  result: AssistResult;
  /** Milliseconds to wait before resolving. Defaults to 0 (resolve on next microtask). */
  delayMs?: number;
}

export class FakeProvider implements AssistProvider {
  readonly id: 'cli' | 'api' | 'clipboard';

  private readonly result: AssistResult;
  private readonly delayMs: number;

  /** Contexts passed to `suggest`, in call order — useful for assertions. */
  readonly calls: AssistContext[] = [];

  constructor(options: FakeProviderOptions) {
    this.id = options.id ?? 'cli';
    this.result = options.result;
    this.delayMs = options.delayMs ?? 0;
  }

  suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult> {
    this.calls.push(ctx);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(this.result), this.delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

/** Convenience: a FakeProvider that always resolves with a canned suggestion. */
export function fakeSuggestion(text: string, delayMs = 0): FakeProvider {
  return new FakeProvider({ result: { kind: 'suggestion', text }, delayMs });
}

/** Convenience: a FakeProvider that always resolves with a canned error. */
export function fakeError(message: string, delayMs = 0): FakeProvider {
  return new FakeProvider({ result: { kind: 'error', message }, delayMs });
}

/** Convenience: a FakeProvider that always resolves with a canned clipboard result. */
export function fakeClipboard(message: string, delayMs = 0): FakeProvider {
  return new FakeProvider({ id: 'clipboard', result: { kind: 'clipboard', message }, delayMs });
}
