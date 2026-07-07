// AssistSettings migration + sanitize (design doc D7 §"Settings", Slice C).
// The persisted `assist` blob grew from the d4 single-claude shape
// ({ cliPath, cliState, checkedAt }) to the multi-provider shape. These tests
// pin that an OLD settings.json loads unchanged (migrates + re-serializes
// sanely) and that every NEW field is defensively sanitized (garbage rejected).
import { describe, expect, it } from 'vitest';
import { sanitize, sanitizeAssist } from '../settings';
import type { AssistSettings } from '../settings';

describe('sanitizeAssist — migration from the old d4 shape', () => {
  it('maps old cliPath → cliPaths.claude and defaults provider to claude', () => {
    const old = { cliPath: '/Users/john/.claude/local/claude', cliState: 'ok', checkedAt: 1710000000000 };
    const migrated = sanitizeAssist(old);
    expect(migrated).toEqual({
      provider: 'claude',
      cliPaths: { claude: '/Users/john/.claude/local/claude' },
    });
    // transient detection state (cliState/checkedAt) is intentionally dropped
    expect(migrated).not.toHaveProperty('cliState');
    expect(migrated).not.toHaveProperty('checkedAt');
  });

  it('preserves includeDraft across the migration', () => {
    const migrated = sanitizeAssist({ cliPath: '/opt/claude', includeDraft: false });
    expect(migrated).toEqual({
      provider: 'claude',
      cliPaths: { claude: '/opt/claude' },
      includeDraft: false,
    });
  });

  it('an old blob with no cliPath (never detected) → just its includeDraft', () => {
    expect(sanitizeAssist({ cliState: 'not-found', checkedAt: 1, includeDraft: true })).toEqual({
      includeDraft: true,
    });
  });

  it('does not overwrite a NEW provider/cliPaths.claude already present', () => {
    const migrated = sanitizeAssist({
      cliPath: '/old/claude', // legacy
      provider: 'codex', // new, explicit
      cliPaths: { claude: '/new/claude' },
    });
    expect(migrated?.provider).toBe('codex');
    expect(migrated?.cliPaths?.claude).toBe('/new/claude');
  });
});

describe('sanitizeAssist — full round-trip of an old settings.json blob', () => {
  it('old-shape blob migrates and re-serializes to a stable, sane JSON', () => {
    const oldFile = {
      tlgDir: '/tlg',
      lastOpened: { workId: 'metaph', book: 7, chapter: 3 },
      assist: { cliPath: '/opt/homebrew/bin/claude', cliState: 'ok', checkedAt: 1710000000000, includeDraft: true },
    };
    const loaded = sanitize(oldFile);
    // top-level fields survive
    expect(loaded.tlgDir).toBe('/tlg');
    expect(loaded.lastOpened).toEqual({ workId: 'metaph', book: 7, chapter: 3 });
    // assist migrated
    expect(loaded.assist).toEqual({
      provider: 'claude',
      cliPaths: { claude: '/opt/homebrew/bin/claude' },
      includeDraft: true,
    });
    // serialize → reparse → re-sanitize is a fixed point (idempotent)
    const roundTripped = sanitize(JSON.parse(JSON.stringify(loaded)));
    expect(roundTripped).toEqual(loaded);
  });
});

describe('sanitizeAssist — defensive sanitizing of the new fields', () => {
  it('accepts a fully-populated valid new blob unchanged', () => {
    const full: AssistSettings = {
      provider: 'gemini',
      cliPaths: { claude: '/a', codex: '/b', gemini: '/c' },
      custom: { binPath: '/x', args: ['--flag', 'v'], promptVia: 'arg' },
      apiKeys: { openai: 'k1', anthropic: 'k2', google: 'k3' },
      models: { anthropic: 'claude-3' },
      includeDraft: true,
    };
    expect(sanitizeAssist(full)).toEqual(full);
  });

  it('rejects an unknown provider value', () => {
    expect(sanitizeAssist({ provider: 'skynet' })).toBeUndefined();
    expect(sanitizeAssist({ provider: 42 as unknown })).toBeUndefined();
  });

  it('accepts every valid provider choice', () => {
    for (const p of ['claude', 'codex', 'gemini', 'custom', 'openai', 'anthropic', 'google']) {
      expect(sanitizeAssist({ provider: p })?.provider).toBe(p);
    }
  });

  it('drops unknown cliPaths keys and non-string values', () => {
    const cleaned = sanitizeAssist({
      cliPaths: { claude: '/a', bogus: '/b', codex: 99 },
    });
    expect(cleaned?.cliPaths).toEqual({ claude: '/a' });
  });

  it('drops cliPaths entirely when nothing valid survives', () => {
    expect(sanitizeAssist({ cliPaths: { bogus: '/b' } })).toBeUndefined();
    expect(sanitizeAssist({ cliPaths: 'nope' as unknown })).toBeUndefined();
  });

  it('sanitizes the custom shape: binPath string, string args, enum promptVia', () => {
    expect(sanitizeAssist({ custom: { binPath: '/x', args: ['a'], promptVia: 'stdin' } })?.custom).toEqual({
      binPath: '/x',
      args: ['a'],
      promptVia: 'stdin',
    });
    // bad args (non-string element) → args dropped; bad promptVia → dropped
    expect(sanitizeAssist({ custom: { binPath: '/x', args: ['a', 3], promptVia: 'pipe' } })?.custom).toEqual({
      binPath: '/x',
    });
    // empty custom → dropped
    expect(sanitizeAssist({ custom: {} })).toBeUndefined();
  });

  it('keeps only string API keys', () => {
    expect(sanitizeAssist({ apiKeys: { openai: 'k', anthropic: 5, bogus: 'x' } })?.apiKeys).toEqual({
      openai: 'k',
    });
    expect(sanitizeAssist({ apiKeys: { anthropic: 7 } })).toBeUndefined();
  });

  it('keeps only string model overrides', () => {
    expect(sanitizeAssist({ models: { anthropic: 'm', openai: 2 } })?.models).toEqual({ anthropic: 'm' });
  });

  it('non-object garbage → undefined', () => {
    expect(sanitizeAssist(null)).toBeUndefined();
    expect(sanitizeAssist('hi')).toBeUndefined();
    expect(sanitizeAssist(undefined)).toBeUndefined();
    expect(sanitizeAssist([])).toBeUndefined();
  });

  it('includeDraft must be a boolean', () => {
    expect(sanitizeAssist({ includeDraft: true })).toEqual({ includeDraft: true });
    expect(sanitizeAssist({ includeDraft: 'yes' as unknown })).toBeUndefined();
  });
});
