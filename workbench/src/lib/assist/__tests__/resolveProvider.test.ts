import { describe, expect, it } from 'vitest';
import { resolveProvider } from '../resolveProvider';

describe('resolveProvider', () => {
  it('CLI ok with a resolved path -> "cli"', () => {
    const choice = resolveProvider(undefined, { cliPath: '/Users/john/.claude/local/claude', cliState: 'ok' });
    expect(choice).toBe('cli');
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

  it('settings are accepted but do not currently change the outcome (API provider deferred)', () => {
    const detection = { cliPath: '/Users/john/.claude/local/claude', cliState: 'ok' } as const;
    expect(resolveProvider({}, detection)).toBe('cli');
    expect(resolveProvider({ cliPath: 'whatever' }, detection)).toBe('cli');
  });
});
