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
export function looksAuthRelated(message: string): boolean {
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

/**
 * parsePlainText — the parser for CLIs that print the finished answer as plain
 * prose on stdout (Codex, Gemini, the custom command), rather than a JSON
 * envelope. Trim the output:
 *   - empty → `{ error: 'empty output', authLike: false }`
 *   - otherwise → `{ text: trimmed }`
 *
 * Plain CLIs print real errors to stderr, which the Rust side already folds
 * into its unauth sniff. But a tool that prints an auth error to *stdout*
 * (some do) would otherwise slip through as a bogus "suggestion", so we
 * auth-sniff a non-empty output too: if the whole trimmed output reads
 * auth-related, surface it as `{ error, authLike: true }` instead of text.
 */
export function parsePlainText(stdout: string): ParseResult {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return { error: 'empty output', authLike: false };
  }
  if (looksAuthRelated(trimmed)) {
    return { error: trimmed, authLike: true };
  }
  return { text: trimmed };
}

/**
 * parseCodexJsonl — the parser for `codex exec --json` (VERIFIED against the
 * installed Codex CLI v0.142.4). Codex exec does NOT print the answer as plain
 * stdout; it emits a JSONL event stream (one JSON object per line) mixing
 * reasoning, mcp_tool_call, and turn.completed usage events. The finished
 * translation is the LAST event of the form:
 *
 *   {"type":"item.completed","item":{"type":"agent_message","text":"..."}}
 *
 * We split on newlines, JSON.parse each non-empty line (skipping any that
 * don't parse — the stream can contain non-JSON noise), collect every
 * agent_message text, and return the LAST one trimmed. If there is none, we
 * degrade to `{ error, authLike }`, auth-sniffing the raw stdout so a login
 * prompt printed as events (or plain text) is still surfaced correctly.
 */
export function parseCodexJsonl(stdout: string): ParseResult {
  const texts: string[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue; // non-JSON noise line
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const obj = entry as Record<string, unknown>;
    if (obj.type !== 'item.completed') continue;
    const item = obj.item;
    if (typeof item !== 'object' || item === null) continue;
    const itemObj = item as Record<string, unknown>;
    if (itemObj.type === 'agent_message' && typeof itemObj.text === 'string') {
      texts.push(itemObj.text);
    }
  }

  if (texts.length === 0) {
    return { error: 'no answer', authLike: looksAuthRelated(stdout) };
  }

  const last = texts[texts.length - 1].trim();
  if (last.length === 0) {
    return { error: 'no answer', authLike: looksAuthRelated(stdout) };
  }
  return { text: last };
}
