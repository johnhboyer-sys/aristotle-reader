import { describe, expect, it } from 'vitest';
import {
  CliProvider,
  DEFAULT_TIMEOUT_MS,
  buildCliInvocation,
  type InvokeFn,
  type RunInvokeFn,
} from '../cliProvider';
import { GENERIC_ERROR_MESSAGE, UNAUTH_MESSAGE } from '../messages';
import { CLI_TOOLS } from '../tools';
import type { ParseResult } from '../parse';
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

describe('buildCliInvocation', () => {
  it('stdin-mode (claude): stdin carries the composed prompt, args unchanged', () => {
    const { args, stdin } = buildCliInvocation(CLI_TOOLS.claude, GOLDEN_CONTEXT);
    expect(args).toEqual(['-p', '--output-format', 'json', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}']);
    expect(stdin).not.toBeNull();
    expect(stdin as string).toContain('>>> TARGET line to translate:');
    // The system framing rides along on stdin too.
    expect(stdin as string).toContain('professional classicist');
  });

  it('arg-mode (gemini): stdin is null, the composed prompt is the trailing argv element', () => {
    const { args, stdin } = buildCliInvocation(CLI_TOOLS.gemini, GOLDEN_CONTEXT);
    expect(stdin).toBeNull();
    expect(args[0]).toBe('-p'); // the fixed flag stays first
    expect(args.length).toBe(2);
    expect(args[args.length - 1]).toContain('>>> TARGET line to translate:');
  });
});

describe('CliProvider (generalized assist_run mode)', () => {
  const okParser = (stdout: string): ParseResult => ({ text: stdout.trim() });

  it('calls invoke with the assist_run contract: binPath/args/stdin/timeoutMs', async () => {
    let seenCmd: string | undefined;
    let seenArgs: unknown;
    const invoke: RunInvokeFn = async (cmd, args) => {
      seenCmd = cmd;
      seenArgs = args;
      return { ok: true, text: 'the suggestion' };
    };
    const provider = new CliProvider({
      binPath: '/opt/homebrew/bin/codex',
      args: ['exec', '-'],
      stdin: 'PROMPT TEXT',
      parseOutput: okParser,
      invoke,
    });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(seenCmd).toBe('assist_run');
    expect(seenArgs).toEqual({
      binPath: '/opt/homebrew/bin/codex',
      args: ['exec', '-'],
      stdin: 'PROMPT TEXT',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    expect(result).toEqual({ kind: 'suggestion', text: 'the suggestion' });
  });

  it('arg-mode: prompt lives in args, stdin is null (passed straight through)', async () => {
    let seenArgs: string[] | undefined;
    let seenStdin: string | null | undefined;
    const invoke: RunInvokeFn = async (_cmd, a) => {
      seenArgs = a.args;
      seenStdin = a.stdin;
      return { ok: true, text: 'x' };
    };
    const provider = new CliProvider({
      binPath: '/opt/homebrew/bin/gemini',
      args: ['-p', 'THE PROMPT'],
      stdin: null,
      parseOutput: okParser,
      invoke,
    });
    await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(seenArgs).toEqual(['-p', 'THE PROMPT']);
    expect(seenStdin).toBeNull();
  });

  it('ok + parseOutput -> { text } maps to a suggestion', async () => {
    const invoke: RunInvokeFn = async () => ({ ok: true, text: '  trimmed answer  ' });
    const provider = new CliProvider({
      binPath: '/b',
      args: [],
      stdin: 'p',
      parseOutput: okParser,
      invoke,
    });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'suggestion', text: 'trimmed answer' });
  });

  it('ok + parseOutput -> { error, authLike:true } maps to the sign-in sentence', async () => {
    const invoke: RunInvokeFn = async () => ({ ok: true, text: 'please sign in' });
    const provider = new CliProvider({
      binPath: '/b',
      args: [],
      stdin: 'p',
      parseOutput: (s): ParseResult => ({ error: s, authLike: true }),
      invoke,
    });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: UNAUTH_MESSAGE });
  });

  it('ok + parseOutput -> { error, authLike:false } maps to the generic sentence', async () => {
    const invoke: RunInvokeFn = async () => ({ ok: true, text: 'garbage' });
    const provider = new CliProvider({
      binPath: '/b',
      args: [],
      stdin: 'p',
      parseOutput: (): ParseResult => ({ error: 'no answer', authLike: false }),
      invoke,
    });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE });
  });

  it('!ok kind "unauth" -> the sign-in sentence (parseOutput never runs)', async () => {
    let parserCalled = false;
    const invoke: RunInvokeFn = async () => ({ ok: false, kind: 'unauth' });
    const provider = new CliProvider({
      binPath: '/b',
      args: [],
      stdin: 'p',
      parseOutput: (): ParseResult => {
        parserCalled = true;
        return { text: 'never' };
      },
      invoke,
    });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: UNAUTH_MESSAGE });
    expect(parserCalled).toBe(false);
  });

  it('!ok kind "timeout"/"error" -> the generic sentence', async () => {
    for (const kind of ['timeout', 'error'] as const) {
      const invoke: RunInvokeFn = async () => ({ ok: false, kind });
      const provider = new CliProvider({ binPath: '/b', args: [], stdin: 'p', parseOutput: okParser, invoke });
      const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
      expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE });
    }
  });

  it('ignores a late result once the signal is aborted', async () => {
    const controller = new AbortController();
    const invoke: RunInvokeFn = async () => {
      controller.abort();
      return { ok: true, text: 'late' };
    };
    const provider = new CliProvider({ binPath: '/b', args: [], stdin: 'p', parseOutput: okParser, invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, controller.signal);
    expect(result).not.toEqual({ kind: 'suggestion', text: 'late' });
  });
});
