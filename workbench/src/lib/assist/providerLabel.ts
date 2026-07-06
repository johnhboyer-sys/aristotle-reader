/**
 * A human label for the currently-configured AI-assist provider, shown in the
 * Ask panel so the translator always knows which model is answering. Derived
 * from the user's explicit settings choice; an unset provider means auto-detect
 * (which prefers Claude Code), so that is the default label.
 */
import type { AssistSettings } from '../settings';
import { CLI_TOOLS } from './tools';

export function assistProviderLabel(assist: AssistSettings | undefined): string {
  const provider = assist?.provider;
  const model = (id: string) => assist?.models?.[id]?.trim();
  switch (provider) {
    case 'codex':
      return CLI_TOOLS.codex.label;
    case 'gemini':
      return CLI_TOOLS.gemini.label;
    case 'custom': {
      const bin = assist?.custom?.binPath?.split('/').pop()?.trim();
      return bin ? `Custom · ${bin}` : 'Custom command';
    }
    case 'openai': {
      const m = model('openai');
      return m ? `OpenAI · ${m}` : 'OpenAI';
    }
    case 'anthropic': {
      const m = model('anthropic');
      return m ? `Anthropic · ${m}` : 'Anthropic API';
    }
    case 'google': {
      const m = model('google');
      return m ? `Google · ${m}` : 'Google';
    }
    case 'claude':
    default:
      // Explicit Claude, or unset (auto-detect prefers Claude Code).
      return CLI_TOOLS.claude.label;
  }
}
