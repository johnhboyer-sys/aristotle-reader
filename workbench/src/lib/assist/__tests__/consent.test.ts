import { describe, expect, it } from 'vitest';
import {
  consentPrompt,
  grantConsent,
  hasConsent,
  revokeConsent,
  type ConsentProviderId,
} from '../consent';

describe('consentPrompt', () => {
  it('names the recipient and what goes, word for word (John 2026-10-03)', () => {
    expect(consentPrompt('claude', { includeDraft: true, window: 6 })).toEqual({
      title: 'Send this to Anthropic?',
      body:
        'This sends text to Anthropic, through your Claude Code login: the source line, up to 6 rows on ' +
        'either side, and your draft English for those rows. Check and Ask also send your English for ' +
        'this line, and Ask sends your question. Nothing goes until you allow it. You can take this back ' +
        'in Settings › AI.',
    });
  });

  it('with "include draft" off, drops the draft clause but still says Check and Ask send it', () => {
    const { body } = consentPrompt('claude', { includeDraft: false, window: 6 });
    expect(body).toContain('the source line and up to 6 rows on either side.');
    expect(body).not.toContain('your draft English for those rows');
    // Check and Ask send the draft around the line whatever the setting says.
    expect(body).toContain('Check and Ask also send your English for this line and the draft around it');
  });

  it.each([
    ['codex', 'Send this to OpenAI?', 'OpenAI, through your Codex login'],
    ['openai', 'Send this to OpenAI?', 'OpenAI, with your API key'],
    ['anthropic', 'Send this to Anthropic?', 'Anthropic, with your API key'],
    ['google', 'Send this to Google?', 'Google, with your API key'],
  ] as const)('%s names its recipient', (id, title, recipient) => {
    const p = consentPrompt(id, { includeDraft: true, window: 6 });
    expect(p.title).toBe(title);
    expect(p.body).toContain(`This sends text to ${recipient}:`);
  });

  it('a custom command is named by its program, and the prompt says it may pass the text on', () => {
    const p = consentPrompt('custom', { includeDraft: true, window: 6, customName: 'mytool' });
    expect(p.title).toBe('Send this to mytool?');
    expect(p.body).toContain('This sends text to the program you chose (mytool), and wherever it sends it:');
  });
});

describe('consent store', () => {
  it('no consent until granted, per provider', () => {
    expect(hasConsent(undefined, 'claude')).toBe(false);
    const granted = grantConsent({ provider: 'claude' }, 'claude');
    expect(hasConsent(granted, 'claude')).toBe(true);
    expect(hasConsent(granted, 'codex')).toBe(false);
    expect(granted.provider).toBe('claude'); // the rest of the blob is kept
  });

  it('granting twice stores the id once', () => {
    const twice = grantConsent(grantConsent({}, 'anthropic'), 'anthropic');
    expect(twice.consented).toEqual(['anthropic']);
  });

  it('revoking takes away only that provider, and drops an empty list', () => {
    const both = grantConsent(grantConsent({}, 'claude'), 'codex');
    const one = revokeConsent(both, 'claude');
    expect(hasConsent(one, 'claude')).toBe(false);
    expect(hasConsent(one, 'codex')).toBe(true);
    expect(revokeConsent(one, 'codex').consented).toBeUndefined();
  });

  it('every sending provider id can be granted', () => {
    const ids: ConsentProviderId[] = ['claude', 'codex', 'custom', 'openai', 'anthropic', 'google'];
    for (const id of ids) expect(hasConsent(grantConsent({}, id), id)).toBe(true);
  });
});
