/**
 * The models the Ask panel's picker offers, per provider, and the pick
 * remembered in settings.assist.models (one entry per provider; absent = the
 * provider's default).
 *
 * For the CLIs the window only names a model: Rust checks it against its own
 * fixed list (`AssistTool::models` in src-tauri/src/jobs.rs) and builds the
 * flag itself (workbench-design/sandboxing-plan.md). The two lists below are
 * pinned to Rust's by models.test.ts. The Anthropic API ids are the current
 * Claude models; OpenAI and Google get no picker until their ids are checked.
 *
 * Pure data and functions: no IO (isolation.test.ts).
 */

import type { AssistProviderChoice, AssistSettings } from '../settings';
import type { CliToolId } from './tools';

export interface ModelOption {
  id: string;
  label: string;
}

export const PROVIDER_MODELS: Partial<Record<AssistProviderChoice, readonly ModelOption[]>> = {
  claude: [
    { id: 'fable', label: 'Fable' },
    { id: 'opus', label: 'Opus' },
    { id: 'sonnet', label: 'Sonnet' },
    { id: 'haiku', label: 'Haiku' },
  ],
  codex: [
    { id: 'gpt-6.1-sol', label: 'GPT-6.1-Sol' },
    { id: 'gpt-6-sol', label: 'GPT-6-Sol' },
    { id: 'gpt-6-astra', label: 'GPT-6-Astra' },
    { id: 'gpt-6-luna', label: 'GPT-6-Luna' },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol' },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6-Terra' },
    { id: 'gpt-5.6-luna', label: 'GPT-5.6-Luna' },
    { id: 'gpt-5.5', label: 'GPT-5.5' },
  ],
  anthropic: [
    { id: 'claude-fable-5-1', label: 'Fable 5.1' },
    { id: 'claude-opus-5-5', label: 'Opus 5.5' },
    { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  ],
};

function listed(provider: AssistProviderChoice, id: string | undefined): id is string {
  return !!id && (PROVIDER_MODELS[provider] ?? []).some((m) => m.id === id);
}

/** True for the providers whose request carries whatever model is saved (the
 * API providers); a CLI runs only a listed one. */
function usesAnySaved(provider: AssistProviderChoice): boolean {
  return provider === 'openai' || provider === 'anthropic' || provider === 'google';
}

/** The model to send `assist_run` for `tool`: the saved one when it is on the
 * list, else none (the CLI's default) — Rust would refuse anything else. */
export function cliModel(tool: CliToolId, models: Record<string, string> | undefined): string | undefined {
  const id = models?.[tool];
  return listed(tool, id) ? id : undefined;
}

/** Whose models the picker shows: the chosen provider, or Claude Code when
 * none is chosen (auto-detect runs Claude). */
export function pickerProvider(assist: AssistSettings | undefined): AssistProviderChoice {
  return assist?.provider ?? 'claude';
}

/** The picker's selection: the model the next request will use, '' for the
 * default. Read as the requests read it, untrimmed: a CLI runs only an exact
 * listed id (cliModel), an API provider sends any non-blank id as saved. */
export function pickerValue(assist: AssistSettings | undefined): string {
  const provider = pickerProvider(assist);
  const id = assist?.models?.[provider];
  if (!id?.trim()) return '';
  return listed(provider, id) || usesAnySaved(provider) ? id : '';
}

/** The picker's entries (besides Default) for the chosen provider, with an
 * API provider's unlisted saved model added so the picker shows what runs;
 * undefined when the provider has no picker. */
export function pickerOptions(assist: AssistSettings | undefined): readonly ModelOption[] | undefined {
  const provider = pickerProvider(assist);
  const list = PROVIDER_MODELS[provider];
  if (!list) return undefined;
  const value = pickerValue(assist);
  return value && !listed(provider, value) ? [...list, { id: value, label: value }] : list;
}

/** `assist` with `provider`'s model set to `id` ('' forgets it). */
export function withModel(assist: AssistSettings, provider: AssistProviderChoice, id: string): AssistSettings {
  const models = { ...assist.models };
  if (id) models[provider] = id;
  else delete models[provider];
  const { models: _old, ...rest } = assist;
  return Object.keys(models).length > 0 ? { ...rest, models } : rest;
}
