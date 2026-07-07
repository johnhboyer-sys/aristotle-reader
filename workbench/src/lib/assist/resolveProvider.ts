/**
 * resolveProvider — pure selection policy over (assist settings, detection).
 * D7 §Slice A generalization of the d4 policy.
 *
 * Provider ids fall into three buckets:
 *   - CLI tools: 'claude' | 'codex' | 'gemini' | 'custom' → a CLI provider,
 *     which needs a resolved binary path (from the detection map). If the
 *     chosen tool has no usable resolved path, we fall back to clipboard.
 *   - API providers: 'openai' | 'anthropic' | 'google' → 'api' (Slice D builds
 *     ApiProvider; here we only return the choice id + which api provider).
 *   - nothing usable → 'clipboard'.
 *
 * The return is shaped so the controller (Slice C) can act on it without
 * re-deriving anything: `{ kind, tool?, apiProvider? }`.
 *
 * Back-compat: the legacy call form `resolveProvider(settings, { cliPath,
 * cliState })` still works and still returns a bare string via the legacy
 * overload path (the editor's older code and resolveProvider.test.ts use it).
 */

import type { AssistSettings } from '../settings';

export type ProviderChoiceKind = 'cli' | 'api' | 'clipboard';

/** The CLI tool ids that map to a CLI provider. */
export type CliProviderId = 'claude' | 'codex' | 'gemini' | 'custom';
/** The API provider ids that map to an API provider. */
export type ApiProviderId = 'openai' | 'anthropic' | 'google';
/** Every settings.assist.provider value. */
export type AssistProviderId = CliProviderId | ApiProviderId;

/** Legacy detection shape (single claude resolution). */
export interface DetectionResult {
  /** Absolute resolved path to the `claude` binary, or null if not found. */
  cliPath: string | null;
  cliState: 'ok' | 'not-found' | 'unauth';
}

/**
 * Generalized detection map: per-CLI-tool resolved absolute paths (null when a
 * tool is not found / not resolved). Only the tool the user selected needs to
 * be present, but the controller may fill in all it has detected.
 */
export interface DetectionMap {
  paths: Partial<Record<CliProviderId, string | null>>;
}

/** The controller-actionable choice. */
export type ProviderChoice =
  | { kind: 'cli'; tool: CliProviderId; binPath: string }
  | { kind: 'api'; apiProvider: ApiProviderId }
  | { kind: 'clipboard' };

const CLI_IDS: readonly CliProviderId[] = ['claude', 'codex', 'gemini', 'custom'];
const API_IDS: readonly ApiProviderId[] = ['openai', 'anthropic', 'google'];

function isCliId(id: string): id is CliProviderId {
  return (CLI_IDS as readonly string[]).includes(id);
}
function isApiId(id: string): id is ApiProviderId {
  return (API_IDS as readonly string[]).includes(id);
}

/**
 * Read `settings.assist.provider` defensively. The persisted AssistSettings
 * type is expanded by a parallel slice (Slice C); this function never assumes
 * the field is present and treats an unknown/absent value as "no explicit
 * choice".
 */
function readProviderId(settings: AssistSettings | undefined): AssistProviderId | undefined {
  const raw = (settings as { provider?: unknown } | undefined)?.provider;
  if (typeof raw === 'string' && (isCliId(raw) || isApiId(raw))) {
    return raw;
  }
  return undefined;
}

/**
 * Generalized policy (D7). Given the user's explicit provider choice (if any)
 * and a detection map of resolved CLI paths, return a controller-actionable
 * choice. No explicit choice → try 'claude' from the detection map, else
 * clipboard.
 */
export function resolveAssistProvider(
  settings: AssistSettings | undefined,
  detection: DetectionMap,
): ProviderChoice {
  const chosen = readProviderId(settings);

  if (chosen && isApiId(chosen)) {
    // Slice D turns this into an ApiProvider; here we only report the choice.
    return { kind: 'api', apiProvider: chosen };
  }

  const tool: CliProviderId = chosen && isCliId(chosen) ? chosen : 'claude';
  const path = detection.paths[tool] ?? null;
  if (path) {
    return { kind: 'cli', tool, binPath: path };
  }
  return { kind: 'clipboard' };
}

/**
 * Legacy policy (d4). Kept for existing callers/tests: given the single-claude
 * detection state, choose 'cli' | 'api' | 'clipboard' as a bare string.
 * CLI ok (resolved path + 'ok' state) → 'cli'; anything else → 'clipboard'.
 */
export function resolveProvider(
  _settings: AssistSettings | undefined,
  detection: DetectionResult,
): ProviderChoiceKind {
  if (detection.cliState === 'ok' && detection.cliPath) {
    return 'cli';
  }
  return 'clipboard';
}
