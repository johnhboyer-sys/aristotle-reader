import { describe, expect, it } from 'vitest';
import { ClipboardProvider } from '../clipboardProvider';
import { COPY_FAILED_MESSAGE, NOT_FOUND_MESSAGE } from '../messages';
import { GOLDEN_CONTEXT } from './fixtures';

describe('ClipboardProvider', () => {
  it('id is "clipboard"', () => {
    const provider = new ClipboardProvider({ writeText: async () => {} });
    expect(provider.id).toBe('clipboard');
  });

  it('writes the clipboard payload and returns { kind: "clipboard", message }', async () => {
    let written: string | undefined;
    const provider = new ClipboardProvider({ writeText: async (text) => { written = text; } });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);

    expect(result).toEqual({ kind: 'clipboard', message: NOT_FOUND_MESSAGE });
    expect(written).toContain('TRANSLATE THIS LINE:');
    expect(written).toContain(GOLDEN_CONTEXT.target.greek);
  });

  it('accepts a custom message (e.g. for a generic-error-triggered copy)', async () => {
    const provider = new ClipboardProvider({ writeText: async () => {}, message: 'custom sentence' });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'clipboard', message: 'custom sentence' });
  });

  it('writeText failure -> { kind: "error", message: COPY_FAILED_MESSAGE }, no stack trace leaked', async () => {
    const provider = new ClipboardProvider({
      writeText: async () => {
        throw new Error('permission denied: some scary internal detail');
      },
    });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: COPY_FAILED_MESSAGE });
  });
});
