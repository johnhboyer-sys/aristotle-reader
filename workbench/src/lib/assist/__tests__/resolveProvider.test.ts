import { describe, expect, it } from 'vitest';
import { resolveProvider, resolveAssistProvider, type DetectionMap } from '../resolveProvider';
import type { AssistSettings } from '../../settings';

// The persisted AssistSettings type is expanded by a parallel slice; cast the
// d7 fields on so this test compiles against today's (narrower) type.
function settingsWith(provider: string): AssistSettings {
  return { provider } as unknown as AssistSettings;
}

describe('resolveProvider', () => {
  it('CLI ok with a resolved path, Claude chosen -> "cli"', () => {
    const choice = resolveProvider({ provider: 'claude' }, { cliPath: '/Users/john/.claude/local/claude', cliState: 'ok' });
    expect(choice).toBe('cli');
  });

  it('CLI ok but no provider chosen -> "clipboard" (Settings promises nothing is sent)', () => {
    const choice = resolveProvider(undefined, { cliPath: '/Users/john/.claude/local/claude', cliState: 'ok' });
    expect(choice).toBe('clipboard');
  });

  it('cliState "not-found" -> "clipboard"', () => {
    const choice = resolveProvider(undefined, { cliPath: null, cliState: 'not-found' });
    expect(choice).toBe('clipboard');
  });

  it('cliState "unauth" -> "clipboard"', () => {
    const choice = resolveProvider(undefined, { cliPath: '/Users/john/.claude/local/claude', cliState: 'unauth' });
    expect(choice).toBe('clipboard');
  });

  it('cliState "ok" but no cliPath (defensive inconsistency) -> "clipboard"', () => {
    const choice = resolveProvider(undefined, { cliPath: null, cliState: 'ok' });
    expect(choice).toBe('clipboard');
  });

  it('only an explicit Claude choice runs the CLI', () => {
    const detection = { cliPath: '/Users/john/.claude/local/claude', cliState: 'ok' } as const;
    expect(resolveProvider({}, detection)).toBe('clipboard');
    expect(resolveProvider({ provider: 'claude' }, detection)).toBe('cli');
  });
});

describe('resolveAssistProvider (generalized D7 policy)', () => {
  const allCliPaths: DetectionMap = {
    paths: {
      claude: '/Users/john/.claude/local/claude',
      codex: '/opt/homebrew/bin/codex',
      gemini: '/opt/homebrew/bin/gemini',
      custom: '/opt/tool/ai',
    },
  };
  const noPaths: DetectionMap = { paths: {} };

  it('no explicit provider -> clipboard, even with every CLI found (never a direct send)', () => {
    expect(resolveAssistProvider(undefined, allCliPaths)).toEqual({ kind: 'clipboard' });
    expect(resolveAssistProvider({}, allCliPaths)).toEqual({ kind: 'clipboard' });
  });

  it('no explicit provider and no resolved claude path -> clipboard', () => {
    expect(resolveAssistProvider(undefined, noPaths)).toEqual({ kind: 'clipboard' });
  });

  it.each(['claude', 'codex', 'gemini', 'custom'] as const)(
    'CLI provider "%s" with a resolved path -> that cli choice',
    (tool) => {
      const choice = resolveAssistProvider(settingsWith(tool), allCliPaths);
      expect(choice).toEqual({ kind: 'cli', tool, binPath: allCliPaths.paths[tool] });
    },
  );

  it('a chosen CLI tool with no resolved path -> clipboard', () => {
    expect(resolveAssistProvider(settingsWith('codex'), noPaths)).toEqual({ kind: 'clipboard' });
  });

  it.each(['openai', 'anthropic', 'google'] as const)(
    'API provider "%s" -> an api choice carrying the provider id',
    (apiProvider) => {
      const choice = resolveAssistProvider(settingsWith(apiProvider), noPaths);
      expect(choice).toEqual({ kind: 'api', apiProvider });
    },
  );

  it('an unknown/garbage provider value -> treated as no explicit choice (clipboard)', () => {
    expect(resolveAssistProvider(settingsWith('nonsense'), allCliPaths)).toEqual({ kind: 'clipboard' });
    expect(resolveAssistProvider(settingsWith('nonsense'), noPaths)).toEqual({ kind: 'clipboard' });
  });
});
