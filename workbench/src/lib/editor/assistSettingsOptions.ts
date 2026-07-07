/**
 * Pure helpers for the AssistSettings UI (D7 §"Settings UI", Slice C). Keeps
 * the provider-option list and the detect-outcome mapping out of the .svelte
 * file so they can be unit-tested in the node environment. No IO, no Tauri.
 *
 * Reads the frozen Slice-A tool registry (CLI_TOOLS) for labels; lives under
 * editor/ (this slice's surface), not assist/ (frozen).
 */

import { CLI_TOOLS } from '../assist/tools';
import type { AssistCliToolId, AssistApiProviderId, AssistProviderChoice } from '../settings';

export interface ProviderOption {
  id: AssistProviderChoice;
  label: string;
  /** 'cli' built-in, 'custom' command, or 'api' key provider — groups the picker. */
  group: 'cli' | 'custom' | 'api';
}

/** The API providers, in display order, with human labels. */
const API_LABELS: Record<AssistApiProviderId, string> = {
  openai: 'OpenAI API',
  anthropic: 'Anthropic API',
  google: 'Google API',
};

/**
 * The full ordered option list for the provider picker: the three built-in
 * CLIs (labels from the tool registry), the custom command, then the three
 * API providers. Built from the registry so a new built-in tool shows up
 * automatically.
 */
export function providerOptions(): ProviderOption[] {
  const cli: ProviderOption[] = (Object.keys(CLI_TOOLS) as AssistCliToolId[]).map((id) => ({
    id,
    label: CLI_TOOLS[id].label,
    group: 'cli',
  }));
  const custom: ProviderOption = { id: 'custom', label: 'Custom command', group: 'custom' };
  const api: ProviderOption[] = (Object.keys(API_LABELS) as AssistApiProviderId[]).map((id) => ({
    id,
    label: API_LABELS[id],
    group: 'api',
  }));
  return [...cli, custom, ...api];
}

/** Per-tool detection outcome shown next to each built-in in the picker. */
export type DetectState = 'unknown' | 'checking' | 'found' | 'not-found';

/** The one-line status label for a built-in tool's detect state. */
export function detectLabel(state: DetectState, path?: string): string {
  switch (state) {
    case 'checking':
      return 'Checking…';
    case 'found':
      return path ? `Found: ${path}` : 'Found';
    case 'not-found':
      return 'Not found';
    default:
      return '';
  }
}

/** The CLI built-in tool ids (for detect iteration). */
export const CLI_TOOL_IDS: readonly AssistCliToolId[] = Object.keys(CLI_TOOLS) as AssistCliToolId[];
