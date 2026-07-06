import { describe, expect, it } from 'vitest';
import { assistProviderLabel } from '../providerLabel';

describe('assistProviderLabel', () => {
  it('defaults to Claude Code when unset (auto-detect prefers Claude)', () => {
    expect(assistProviderLabel(undefined)).toBe('Claude Code');
    expect(assistProviderLabel({})).toBe('Claude Code');
    expect(assistProviderLabel({ provider: 'claude' })).toBe('Claude Code');
  });

  it('labels the built-in CLIs', () => {
    expect(assistProviderLabel({ provider: 'codex' })).toBe('Codex (OpenAI)');
    expect(assistProviderLabel({ provider: 'gemini' })).toBe('Gemini');
  });

  it('labels a custom command by its binary name', () => {
    expect(assistProviderLabel({ provider: 'custom', custom: { binPath: '/opt/bin/mytool' } })).toBe(
      'Custom · mytool',
    );
    expect(assistProviderLabel({ provider: 'custom' })).toBe('Custom command');
  });

  it('labels API providers with the model when set', () => {
    expect(assistProviderLabel({ provider: 'openai', models: { openai: 'gpt-5' } })).toBe('OpenAI · gpt-5');
    expect(assistProviderLabel({ provider: 'anthropic' })).toBe('Anthropic API');
  });
});
