import { describe, expect, it } from 'vitest';
import { assistProviderLabel } from '../providerLabel';

describe('assistProviderLabel', () => {
  it('says clipboard when unset: with no choice nothing is sent', () => {
    expect(assistProviderLabel(undefined)).toBe('the clipboard (no AI chosen)');
    expect(assistProviderLabel({})).toBe('the clipboard (no AI chosen)');
    expect(assistProviderLabel({ provider: 'claude' })).toBe('Claude Code');
  });

  it('labels the built-in CLIs', () => {
    expect(assistProviderLabel({ provider: 'codex' })).toBe('Codex (OpenAI)');
    // A saved Gemini choice runs nothing (disabled until tested); say so.
    expect(assistProviderLabel({ provider: 'gemini' })).toBe('Gemini (disabled)');
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
