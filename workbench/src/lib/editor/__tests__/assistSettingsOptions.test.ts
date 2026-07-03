// Pure helpers for the AssistSettings UI (D7 §"Settings UI", Slice C).
import { describe, expect, it } from 'vitest';
import {
  providerOptions,
  detectLabel,
  CLI_TOOL_IDS,
} from '../assistSettingsOptions';

describe('providerOptions', () => {
  it('lists the three built-in CLIs, custom, then the three API providers', () => {
    const opts = providerOptions();
    expect(opts.map((o) => o.id)).toEqual([
      'claude',
      'codex',
      'gemini',
      'custom',
      'openai',
      'anthropic',
      'google',
    ]);
  });

  it('groups each option correctly', () => {
    const opts = providerOptions();
    const byId = Object.fromEntries(opts.map((o) => [o.id, o.group]));
    expect(byId.claude).toBe('cli');
    expect(byId.codex).toBe('cli');
    expect(byId.gemini).toBe('cli');
    expect(byId.custom).toBe('custom');
    expect(byId.openai).toBe('api');
    expect(byId.anthropic).toBe('api');
    expect(byId.google).toBe('api');
  });

  it('uses the registry labels for built-in CLIs', () => {
    const opts = providerOptions();
    const label = (id: string) => opts.find((o) => o.id === id)?.label;
    expect(label('claude')).toBe('Claude Code');
    expect(label('codex')).toBe('Codex (OpenAI)');
    expect(label('gemini')).toBe('Gemini');
    expect(label('custom')).toBe('Custom command');
  });
});

describe('CLI_TOOL_IDS', () => {
  it('is exactly the three built-in tool ids', () => {
    expect([...CLI_TOOL_IDS].sort()).toEqual(['claude', 'codex', 'gemini']);
  });
});

describe('detectLabel', () => {
  it('maps each detect state to its status sentence', () => {
    expect(detectLabel('unknown')).toBe('');
    expect(detectLabel('checking')).toBe('Checking…');
    expect(detectLabel('not-found')).toBe('Not found');
    expect(detectLabel('found', '/opt/homebrew/bin/claude')).toBe('Found: /opt/homebrew/bin/claude');
    expect(detectLabel('found')).toBe('Found');
  });
});
