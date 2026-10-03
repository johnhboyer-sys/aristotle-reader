/**
 * Consent before the first send (John 2026-10-03). Each provider that sends
 * text off the machine — a CLI on the user's login or an API on their key —
 * is asked about once, before its first request; the answer is kept in
 * `settings.assist.consented` and can be taken back in Settings › AI. With no
 * provider chosen nothing is sent, so there is nothing to ask.
 *
 * Pure: the prompt text and the settings edits. The dialog itself and the
 * gate live in editor/assistController.ts.
 */
import type { AssistSettings } from '../settings';

/** Every provider that can send text (Gemini is disabled and sends nothing). */
export type ConsentProviderId = 'claude' | 'codex' | 'custom' | 'openai' | 'anthropic' | 'google';

/** Short names for the Settings list of allowed providers. */
export const CONSENT_LABELS: Record<ConsentProviderId, string> = {
  claude: 'Claude Code (Anthropic)',
  codex: 'Codex (OpenAI)',
  custom: 'Custom command',
  openai: 'OpenAI API',
  anthropic: 'Anthropic API',
  google: 'Google API',
};

function customLabel(customName: string | undefined): string {
  return customName?.trim() || 'your custom command';
}

function titleName(id: ConsentProviderId, customName?: string): string {
  switch (id) {
    case 'claude':
    case 'anthropic':
      return 'Anthropic';
    case 'codex':
    case 'openai':
      return 'OpenAI';
    case 'google':
      return 'Google';
    case 'custom':
      return customLabel(customName);
  }
}

function recipient(id: ConsentProviderId, customName?: string): string {
  switch (id) {
    case 'claude':
      return 'Anthropic, through your Claude Code login';
    case 'codex':
      return 'OpenAI, through your Codex login';
    case 'custom':
      return `the program you chose (${customLabel(customName)}), and wherever it sends it`;
    default:
      return `${titleName(id)}, with your API key`;
  }
}

export interface ConsentPromptOptions {
  /** settings.assist.includeDraft (default on). */
  includeDraft: boolean;
  /** Context rows on either side of the target (ASSIST_CONTEXT_WINDOW). */
  window: number;
  /** A custom command's program name, e.g. "mytool". */
  customName?: string;
}

/** The prompt's title and body, in John's approved wording. Check and Ask
 * send the draft around the line whatever `includeDraft` says, so with it
 * off the body says so. */
export function consentPrompt(
  id: ConsentProviderId,
  opts: ConsentPromptOptions,
): { title: string; body: string } {
  const rows = `up to ${opts.window} rows on either side`;
  const what = opts.includeDraft
    ? `the source line, ${rows}, and your draft English for those rows.`
    : `the source line and ${rows}.`;
  const checkAsk = opts.includeDraft
    ? 'Check and Ask also send your English for this line, and Ask sends your question.'
    : 'Check and Ask also send your English for this line and the draft around it, and Ask sends your question.';
  return {
    title: `Send this to ${titleName(id, opts.customName)}?`,
    body:
      `This sends text to ${recipient(id, opts.customName)}: ${what} ${checkAsk} ` +
      'Nothing goes until you allow it. You can take this back in Settings › AI.',
  };
}

export function hasConsent(assist: AssistSettings | undefined, id: ConsentProviderId): boolean {
  return assist?.consented?.includes(id) ?? false;
}

/** `assist` with `id` allowed; the rest of the blob is kept. */
export function grantConsent(assist: AssistSettings | undefined, id: ConsentProviderId): AssistSettings {
  const prev = assist ?? {};
  if (hasConsent(prev, id)) return prev;
  return { ...prev, consented: [...(prev.consented ?? []), id] };
}

/** `assist` with `id` taken back; an empty list is dropped. */
export function revokeConsent(assist: AssistSettings | undefined, id: ConsentProviderId): AssistSettings {
  const { consented, ...rest } = assist ?? {};
  const left = (consented ?? []).filter((c) => c !== id);
  return left.length > 0 ? { ...rest, consented: left } : rest;
}
