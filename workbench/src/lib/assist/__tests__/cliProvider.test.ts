import { describe, expect, it } from 'vitest';
import { CliProvider, DEFAULT_TIMEOUT_MS, type InvokeFn } from '../cliProvider';
import { GENERIC_ERROR_MESSAGE, UNAUTH_MESSAGE } from '../messages';
import { GOLDEN_CONTEXT } from './fixtures';

describe('CliProvider', () => {
  it('id is "cli"', () => {
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke: async () => ({ ok: true, text: 'x' }) });
    expect(provider.id).toBe('cli');
  });

  it('calls invoke with the exact contract: cmd "assist_suggest", claudePath/system/user/timeoutMs', async () => {
    let seenCmd: string | undefined;
    let seenArgs: unknown;
    const invoke: InvokeFn = async (cmd, args) => {
      seenCmd = cmd;
      seenArgs = args;
      return { ok: true, text: 'suggestion text' };
    };
    const provider = new CliProvider({ claudePath: '/Users/john/.claude/local/claude', invoke });
    await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);

    expect(seenCmd).toBe('assist_suggest');
    expect(seenArgs).toEqual(
      expect.objectContaining({
        claudePath: '/Users/john/.claude/local/claude',
        timeoutMs: DEFAULT_TIMEOUT_MS,
      }),
    );
    const args = seenArgs as { system: string; user: string };
    expect(typeof args.system).toBe('string');
    expect(args.system.length).toBeGreaterThan(0);
    expect(args.user).toContain('>>> TARGET line to translate:');
  });

  it('honors a custom timeoutMs', async () => {
    let seenTimeout: number | undefined;
    const invoke: InvokeFn = async (_cmd, args) => {
      seenTimeout = args.timeoutMs;
      return { ok: true, text: 'x' };
    };
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke, timeoutMs: 5000 });
    await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(seenTimeout).toBe(5000);
  });

  it('ok:true -> { kind: "suggestion", text }', async () => {
    const invoke: InvokeFn = async () => ({ ok: true, text: 'This is what it was to be.' });
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'suggestion', text: 'This is what it was to be.' });
  });

  it('ok:false kind "unauth" -> the sign-in sentence, never technical detail', async () => {
    const invoke: InvokeFn = async () => ({ ok: false, kind: 'unauth' });
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: UNAUTH_MESSAGE });
  });

  it('ok:false kind "timeout" -> the generic error sentence', async () => {
    const invoke: InvokeFn = async () => ({ ok: false, kind: 'timeout' });
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE });
  });

  it('ok:false kind "error" -> the generic error sentence', async () => {
    const invoke: InvokeFn = async () => ({ ok: false, kind: 'error' });
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE });
  });

  it('has no clipboard dependency at all — constructor options carry only claudePath/invoke/timeoutMs', async () => {
    // Structural check: CliProviderOptions has no writeText field, so the
    // provider cannot reach the clipboard even on failure. This test just
    // confirms failure returns an error result (the caller decides to copy).
    const invoke: InvokeFn = async () => ({ ok: false, kind: 'unauth' });
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result.kind).toBe('error');
  });

  it('ignores a late result once the signal has been aborted (returns error, not the suggestion)', async () => {
    const controller = new AbortController();
    const invoke: InvokeFn = async () => {
      controller.abort();
      return { ok: true, text: 'late suggestion' };
    };
    const provider = new CliProvider({ claudePath: '/bin/claude', invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, controller.signal);
    expect(result).not.toEqual({ kind: 'suggestion', text: 'late suggestion' });
  });
});
