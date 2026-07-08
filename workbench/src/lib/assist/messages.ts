/**
 * The full set of vetted, plain-sentence user-facing strings for AI-assist
 * (D4 §7 failure table). No provider or UI code may construct a message
 * outside this file — stderr, exit codes, paths, and exception text go to
 * `console.error` only (ExportButton precedent), never into a message the
 * user sees.
 */

/** CLI not found anywhere the detection ladder looks; clipboard fallback ran. */
export const NOT_FOUND_MESSAGE =
  'Copied this line and its context — paste it into Claude or another tool.';

/** CLI found but not signed in / auth expired (John-approved specific sentence). */
export const UNAUTH_MESSAGE = 'Claude Code needs a sign-in — copied to clipboard instead.';

/** CLI ran but errored (non-auth), timed out, or returned malformed/empty output. */
export const GENERIC_ERROR_MESSAGE =
  "Couldn't get a suggestion just now — copied this line to the clipboard instead.";

/** Assist invoked on a row with no source-language line to translate yet. */
export const NO_LINE_MESSAGE = "There's no line here to translate yet.";

/** The paragraph-unit variant of NO_LINE_MESSAGE (D8 §7 unit-aware assist). */
export const NO_PARAGRAPH_MESSAGE = "There's no paragraph here to translate yet.";

/** The clipboard write itself failed. */
export const COPY_FAILED_MESSAGE = "Couldn't copy — try again.";

/** Plain sentence shown by the (deferred) API-key path when there is no network. */
export const API_NETWORK_ERROR_MESSAGE =
  "Couldn't reach Claude just now — copied this line to the clipboard instead.";

/** Plain sentence shown by the (deferred) API-key path on a 401. */
export const API_BAD_KEY_MESSAGE =
  "That Anthropic API key didn't work — check it in Settings. Copied this line to the clipboard instead.";

/** Plain sentence shown by the (deferred) API-key path on 429 / overloaded. */
export const API_BUSY_MESSAGE = 'Claude is busy right now — copied this line to the clipboard instead.';

/**
 * Shown when an API provider was chosen but no API key is stored for it. The
 * controller still runs the clipboard fallback, so the "copied…" clause holds.
 */
export const API_NO_KEY_MESSAGE =
  'Add an API key in Settings to use this AI — copied this line to the clipboard instead.';

// ── service-neutral API-adapter sentences (ApiProvider, any of openai/anthropic/
// google). The three above are Claude-worded from the deferred Slice-C stub;
// these carry no vendor name so one ApiProvider can use them for every service.

/** 401 / 403 from an API service — the stored key is bad. */
export const API_KEY_REJECTED_MESSAGE = "That API key didn't work — check it in Settings.";

/** 429 from an API service — rate-limited / overloaded. */
export const API_SERVICE_BUSY_MESSAGE = 'The AI service is busy right now — try again in a moment.';

/** Network failure, abort, other non-2xx, or malformed/empty response. */
export const API_UNREACHABLE_MESSAGE = "Couldn't reach the AI service just now — try again.";
