import { describe, expect, it } from 'vitest';
import { CliProvider, DEFAULT_TIMEOUT_MS, composeCliPrompt, type RunInvokeFn } from '../cliProvider';
import { CODEX_UNTESTED_MESSAGE, GENERIC_ERROR_MESSAGE, TESTED_CODEX_VERSIONS, UNAUTH_MESSAGE } from '../messages';
import { buildAssistPrompt } from '../prompt';
import type { ParseResult } from '../parse';
import { GOLDEN_CONTEXT } from './fixtures';

const okParser = (stdout: string): ParseResult => ({ text: stdout.trim() });

describe('composeCliPrompt', () => {
  it('is the system framing, a blank line, then the user context block', () => {
    const { system, user } = buildAssistPrompt(GOLDEN_CONTEXT);
    expect(composeCliPrompt(GOLDEN_CONTEXT)).toBe(`${system}\n\n${user}`);
    expect(composeCliPrompt(GOLDEN_CONTEXT)).toContain('>>> TARGET line to translate:');
  });
});

describe('CliProvider', () => {
  it('id is "cli"', () => {
    const provider = new CliProvider({ tool: 'claude', parseOutput: okParser, invoke: async () => ({ ok: true, text: 'x' }) });
    expect(provider.id).toBe('cli');
  });

  it('names the tool and sends the prompt — never a program or argv (sandboxing plan)', async () => {
    const seen: { cmd: string; args: unknown }[] = [];
    const invoke: RunInvokeFn = async (cmd, args) => {
      seen.push({ cmd, args });
      return { ok: true, text: 'the suggestion' };
    };
    const provider = new CliProvider({ tool: 'codex', parseOutput: okParser, invoke });
    const result = await provider.suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(seen).toEqual([
      { cmd: 'assist_run', args: { tool: 'codex', prompt: composeCliPrompt(GOLDEN_CONTEXT), timeoutMs: DEFAULT_TIMEOUT_MS } },
    ]);
    expect(result).toEqual({ kind: 'suggestion', text: 'the suggestion' });
  });

  it('sends the model when one is set, and no model key otherwise', async () => {
    const seen: Record<string, unknown>[] = [];
    const invoke: RunInvokeFn = async (_cmd, args) => {
      seen.push({ ...args });
      return { ok: true, text: 'x' };
    };
    await new CliProvider({ tool: 'codex', parseOutput: okParser, invoke, model: 'gpt-6-luna' }).suggest(
      GOLDEN_CONTEXT,
      new AbortController().signal,
    );
    await new CliProvider({ tool: 'codex', parseOutput: okParser, invoke }).suggest(
      GOLDEN_CONTEXT,
      new AbortController().signal,
    );
    expect(seen[0].model).toBe('gpt-6-luna');
    expect('model' in seen[1]).toBe(false);
  });

  it('honors a custom timeoutMs', async () => {
    let seenTimeout: number | undefined;
    const invoke: RunInvokeFn = async (_cmd, args) => {
      seenTimeout = args.timeoutMs;
      return { ok: true, text: 'x' };
    };
    await new CliProvider({ tool: 'claude', parseOutput: okParser, invoke, timeoutMs: 5000 }).suggest(
      GOLDEN_CONTEXT,
      new AbortController().signal,
    );
    expect(seenTimeout).toBe(5000);
  });

  it('ok + parseOutput -> { text } maps to a suggestion', async () => {
    const invoke: RunInvokeFn = async () => ({ ok: true, text: '  trimmed answer  ' });
    const result = await new CliProvider({ tool: 'custom', parseOutput: okParser, invoke }).suggest(
      GOLDEN_CONTEXT,
      new AbortController().signal,
    );
    expect(result).toEqual({ kind: 'suggestion', text: 'trimmed answer' });
  });

  it('ok + parseOutput -> { error, authLike } maps to the sign-in or the generic sentence', async () => {
    const invoke: RunInvokeFn = async () => ({ ok: true, text: 'x' });
    for (const [authLike, message] of [
      [true, UNAUTH_MESSAGE],
      [false, GENERIC_ERROR_MESSAGE],
    ] as const) {
      const result = await new CliProvider({
        tool: 'claude',
        parseOutput: (): ParseResult => ({ error: 'e', authLike }),
        invoke,
      }).suggest(GOLDEN_CONTEXT, new AbortController().signal);
      expect(result).toEqual({ kind: 'error', message });
    }
  });

  it('!ok kind "untested" -> says nothing was sent and why (parseOutput never runs)', async () => {
    let parserCalled = false;
    const invoke: RunInvokeFn = async () => ({ ok: false, kind: 'untested' });
    const result = await new CliProvider({
      tool: 'codex',
      parseOutput: (): ParseResult => {
        parserCalled = true;
        return { text: 'never' };
      },
      invoke,
    }).suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: CODEX_UNTESTED_MESSAGE });
    expect(CODEX_UNTESTED_MESSAGE).toMatch(/^Nothing was sent/);
    expect(parserCalled).toBe(false);
  });

  it('names the same tested Codex versions Rust checks', async () => {
    const fs = (await import(/* @vite-ignore */ 'node' + ':fs')) as unknown as {
      readFileSync(path: string, encoding: 'utf-8'): string;
    };
    const nodeUrl = (await import(/* @vite-ignore */ 'node' + ':url')) as unknown as {
      fileURLToPath(url: URL): string;
    };
    const jobsRs = fs.readFileSync(nodeUrl.fileURLToPath(new URL('../../../../src-tauri/src/jobs.rs', import.meta.url)), 'utf-8');
    const m = jobsRs.match(/pub const TESTED_CODEX_VERSIONS: &\[&str\] = &\[([^\]]*)\]/);
    const rust = [...(m?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(rust.length).toBeGreaterThan(0);
    expect(TESTED_CODEX_VERSIONS).toEqual(rust);
    for (const v of rust) expect(CODEX_UNTESTED_MESSAGE).toContain(v);
  });

  it('!ok kind "unauth" -> the sign-in sentence (parseOutput never runs)', async () => {
    let parserCalled = false;
    const invoke: RunInvokeFn = async () => ({ ok: false, kind: 'unauth' });
    const result = await new CliProvider({
      tool: 'claude',
      parseOutput: (): ParseResult => {
        parserCalled = true;
        return { text: 'never' };
      },
      invoke,
    }).suggest(GOLDEN_CONTEXT, new AbortController().signal);
    expect(result).toEqual({ kind: 'error', message: UNAUTH_MESSAGE });
    expect(parserCalled).toBe(false);
  });

  it('!ok kind "timeout"/"error" -> the generic sentence', async () => {
    for (const kind of ['timeout', 'error'] as const) {
      const invoke: RunInvokeFn = async () => ({ ok: false, kind });
      const result = await new CliProvider({ tool: 'claude', parseOutput: okParser, invoke }).suggest(
        GOLDEN_CONTEXT,
        new AbortController().signal,
      );
      expect(result).toEqual({ kind: 'error', message: GENERIC_ERROR_MESSAGE });
    }
  });

  it('ignores a late result once the signal is aborted', async () => {
    const controller = new AbortController();
    const invoke: RunInvokeFn = async () => {
      controller.abort();
      return { ok: true, text: 'late' };
    };
    const result = await new CliProvider({ tool: 'claude', parseOutput: okParser, invoke }).suggest(
      GOLDEN_CONTEXT,
      controller.signal,
    );
    expect(result).not.toEqual({ kind: 'suggestion', text: 'late' });
  });
});
