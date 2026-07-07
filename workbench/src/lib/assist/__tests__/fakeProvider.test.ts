import { describe, expect, it } from 'vitest';
import { FakeProvider, fakeClipboard, fakeError, fakeSuggestion } from '../fakeProvider';
import { GOLDEN_CONTEXT } from './fixtures';

describe('FakeProvider', () => {
  it('fakeSuggestion resolves with a canned suggestion', async () => {
    const provider = fakeSuggestion('canned text');
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'suggestion', text: 'canned text' });
  });

  it('fakeError resolves with a canned error', async () => {
    const provider = fakeError('canned error message');
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: 'canned error message' });
  });

  it('fakeClipboard resolves with a canned clipboard result and id "clipboard"', async () => {
    const provider = fakeClipboard('canned clipboard message');
    expect(provider.id).toBe('clipboard');
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'clipboard', message: 'canned clipboard message' });
  });

  it('records every call context in order', async () => {
    const provider = fakeSuggestion('x');
    await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(provider.calls).toHaveLength(2);
  });

  it('delay: does not resolve before delayMs elapses', async () => {
    const provider = new FakeProvider({ result: { kind: 'suggestion', text: 'slow' }, delayMs: 20 });
    let resolved = false;
    const promise = provider.suggest(GOLDEN_CONTEXT, new AbortController().signal).then((r) => {
      resolved = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 1));
    expect(resolved).toBe(false);
    const result = await promise;
    expect(resolved).toBe(true);
    expect(result).toEqual({ kind: 'suggestion', text: 'slow' });
  });

  it('honors an AbortSignal: aborting before resolution rejects with AbortError', async () => {
    const controller = new AbortController();
    const provider = new FakeProvider({ result: { kind: 'suggestion', text: 'slow' }, delayMs: 1000 });
    const promise = provider.suggest(GOLDEN_CONTEXT, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow();
  });

  it('an already-aborted signal rejects immediately', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = fakeSuggestion('x', 1000);
    await expect(provider.suggest(GOLDEN_CONTEXT, controller.signal)).rejects.toThrow();
  });
});
