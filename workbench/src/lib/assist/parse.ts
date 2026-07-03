/**
 * parseClaudeJson — defensive, pure extraction of the result text from
 * `claude -p --output-format json`'s stdout envelope (D4 divergence E).
 *
 * We deliberately do NOT ask the model to emit nested JSON — the `result`
 * field is plain prose. This function never throws: any malformed,
 * truncated, empty, or unexpected-shape input degrades to an `{ error }`
 * result.
 */

export type ParseResult =
  | { text: string }
  | { error: string; authLike: boolean };

const AUTH_HINTS = [
  'not logged in',
  'not authenticated',
  'please log in',
  'please sign in',
  'sign in',
  'log in',
  'login required',
  'authentication',
  'unauthorized',
  'invalid api key',
  'no valid credentials',
  'session expired',
];

/** True if a message reads like an auth/sign-in problem (case-insensitive substring match). */
function looksAuthRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Parse the stdout of `claude -p --output-format json`. Handles:
 *  - a valid envelope with a non-empty `result` string → `{ text }`
 *  - an envelope with `is_error: true` → `{ error, authLike }`
 *  - a valid envelope whose `result` is missing/empty → `{ error }`
 *  - malformed / truncated / non-JSON stdout → `{ error }`
 */
export function parseClaudeJson(stdout: string): ParseResult {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { error: 'empty output', authLike: false };
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(trimmed);
  } catch {
    return { error: 'malformed JSON', authLike: false };
  }

  if (typeof envelope !== 'object' || envelope === null) {
    return { error: 'unexpected JSON shape', authLike: false };
  }

  const obj = envelope as Record<string, unknown>;
  const isError = obj.is_error === true;
  const result = typeof obj.result === 'string' ? obj.result : null;

  if (isError) {
    const message = result && result.length > 0 ? result : 'CLI reported an error';
    return { error: message, authLike: looksAuthRelated(message) };
  }

  if (result === null || result.trim().length === 0) {
    return { error: 'empty result', authLike: false };
  }

  return { text: result };
}
