/**
 * resolveProvider — pure selection policy over (assist settings, detection
 * result). D4 §5c / divergence F: the API-key provider is DEFERRED (not
 * built in this slice); the policy is shaped so `'api'` can slot in later
 * without a reshape, but today it only ever chooses `'cli'` or `'clipboard'`.
 */

import type { AssistSettings } from '../settings';

export type ProviderChoice = 'cli' | 'api' | 'clipboard';

export interface DetectionResult {
  /** Absolute resolved path to the `claude` binary, or null if not found. */
  cliPath: string | null;
  cliState: 'ok' | 'not-found' | 'unauth';
}

/**
 * Pure policy: given the cached/just-resolved detection state (and, in the
 * future, `settings.assist`'s API-key fields), choose a provider id.
 *
 * Today: CLI ok (a resolved path and a non-`not-found`, non-`unauth` state)
 * → `'cli'`; anything else → `'clipboard'`. `settings` is accepted now (and
 * threaded through untouched) so the future API-key opt-in has a place to
 * read from without changing this function's signature.
 */
export function resolveProvider(
  _settings: AssistSettings | undefined,
  detection: DetectionResult,
): ProviderChoice {
  if (detection.cliState === 'ok' && detection.cliPath) {
    return 'cli';
  }
  return 'clipboard';
}
