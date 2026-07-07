/**
 * ApiProvider — AssistProvider over a direct HTTPS call to one of the three
 * API-key services (OpenAI / Anthropic / Google), using the user's OWN key
 * (pay-per-use, billed to them; D7 §"API-key providers"). Off by default: this
 * provider is only ever constructed when the user chose an API provider AND
 * stored a non-empty key for it (see resolveTauriAssistProvider). The webview
 * reaches these hosts through the CSP `connect-src` entries added in
 * tauri.conf.json — the app's only outbound network surface.
 *
 * `fetch` is INJECTED so the whole adapter unit-tests under vitest's node
 * environment with a fake fetch — no real network, no real key. The prompt is
 * built with the shared, pure `buildAssistPrompt(ctx)` → { system, user }.
 *
 * Failure discipline (provider contract + §7 failure table): every non-success
 * path returns `{ kind: 'error', message }` where `message` is a VETTED plain
 * sentence from messages.ts. Raw response bodies, status text, and exception
 * text NEVER reach the user — they go to console.error only, matching the CLI
 * providers. The controller then runs the clipboard fallback, so the
 * "copied…" clause in each sentence stays true.
 *
 * AbortSignal is honored two ways: it is passed to `fetch` (so an in-flight
 * request is actually cancelled), and any result that arrives after the signal
 * fired is discarded (a superseded/cancelled request never renders).
 */

import type { AssistContext, AssistProvider, AssistResult } from './provider';
import { buildAssistPrompt } from './prompt';
import {
  API_KEY_REJECTED_MESSAGE,
  API_NO_KEY_MESSAGE,
  API_SERVICE_BUSY_MESSAGE,
  API_UNREACHABLE_MESSAGE,
} from './messages';

/** The API services this adapter speaks to. */
export type ApiService = 'openai' | 'anthropic' | 'google';

/**
 * Structural `fetch` type — just what this adapter uses. Kept narrow so tests
 * can pass a plain async stub without pulling in the DOM lib's full signature.
 */
export type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponse>;

/** The slice of a fetch Response this adapter reads. */
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export interface ApiProviderOptions {
  service: ApiService;
  apiKey: string;
  /** Optional per-service model override; falls back to the service default. */
  model?: string;
  fetch: FetchFn;
  /** Output cap for the single translated line — small; a line is short. */
  maxTokens?: number;
}

/**
 * Current, sensible per-service defaults. Overridable via
 * settings.assist.models[service] (threaded through as `model`). Anthropic's id
 * is a current Claude model id (claude-api skill).
 */
export const DEFAULT_MODELS: Record<ApiService, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-opus-4-8',
  google: 'gemini-2.0-flash',
};

const DEFAULT_MAX_TOKENS = 1024;

/** The Anthropic messages API version pin (claude-api skill). */
const ANTHROPIC_VERSION = '2023-06-01';

export class ApiProvider implements AssistProvider {
  readonly id = 'api' as const;

  private readonly service: ApiService;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly doFetch: FetchFn;
  private readonly maxTokens: number;

  constructor(options: ApiProviderOptions) {
    this.service = options.service;
    this.apiKey = options.apiKey;
    this.model = options.model && options.model.trim() ? options.model : DEFAULT_MODELS[options.service];
    this.doFetch = options.fetch;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  }

  async suggest(ctx: AssistContext, signal: AbortSignal): Promise<AssistResult> {
    // Missing key: never build a request. (Defense in depth — the controller
    // only constructs an ApiProvider when a non-empty key exists.)
    if (!this.apiKey || !this.apiKey.trim()) {
      return { kind: 'error', message: API_NO_KEY_MESSAGE };
    }

    const { system, user } = buildAssistPrompt(ctx);
    const { url, headers, body } = this.buildRequest(system, user);

    let response: FetchResponse;
    try {
      response = await this.doFetch(url, { method: 'POST', headers, body, signal });
    } catch (err) {
      // Network failure OR the abort surfacing as a thrown AbortError. Either
      // way: if we were aborted, the result is discarded below; otherwise it's
      // an unreachable-service error. Never surface `err`.
      if (signal.aborted) return { kind: 'error', message: API_UNREACHABLE_MESSAGE };
      console.error('[assist] api request failed', err);
      return { kind: 'error', message: API_UNREACHABLE_MESSAGE };
    }

    // Discard anything that arrived after the request was cancelled/superseded.
    if (signal.aborted) return { kind: 'error', message: API_UNREACHABLE_MESSAGE };

    if (!response.ok) {
      return { kind: 'error', message: statusToMessage(response.status) };
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      console.error('[assist] api response was not JSON', err);
      return { kind: 'error', message: API_UNREACHABLE_MESSAGE };
    }
    if (signal.aborted) return { kind: 'error', message: API_UNREACHABLE_MESSAGE };

    const text = this.extractText(payload);
    if (text === null || text.trim().length === 0) {
      // Malformed or empty response — generic, never the raw body.
      console.error('[assist] api response had no usable text');
      return { kind: 'error', message: API_UNREACHABLE_MESSAGE };
    }
    return { kind: 'suggestion', text: text.trim() };
  }

  /** Compose { url, headers, body } for the chosen service. */
  private buildRequest(
    system: string,
    user: string,
  ): { url: string; headers: Record<string, string>; body: string } {
    switch (this.service) {
      case 'openai':
        return {
          url: 'https://api.openai.com/v1/chat/completions',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        };
      case 'anthropic':
        return {
          url: 'https://api.anthropic.com/v1/messages',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': ANTHROPIC_VERSION,
            // REQUIRED from a webview/browser context: without it the call is
            // CORS-blocked. This is the load-bearing "does it work" header for
            // the direct-from-webview path.
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: this.maxTokens,
            system,
            messages: [{ role: 'user', content: user }],
          }),
        };
      case 'google':
        return {
          // The key is a query param on the Generative Language API.
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            this.model,
          )}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: user }] }],
          }),
        };
    }
  }

  /**
   * Defensively pull the model's text out of a success payload. Returns null on
   * any shape mismatch (→ generic error) — never throws, never surfaces the
   * body.
   */
  private extractText(payload: unknown): string | null {
    switch (this.service) {
      case 'openai':
        return readPath(payload, ['choices', 0, 'message', 'content']);
      case 'anthropic':
        return readPath(payload, ['content', 0, 'text']);
      case 'google':
        return readPath(payload, ['candidates', 0, 'content', 'parts', 0, 'text']);
    }
  }
}

/** 401/403 → bad key; 429 → busy; everything else non-2xx → unreachable. */
function statusToMessage(status: number): string {
  if (status === 401 || status === 403) return API_KEY_REJECTED_MESSAGE;
  if (status === 429) return API_SERVICE_BUSY_MESSAGE;
  return API_UNREACHABLE_MESSAGE;
}

/**
 * Walk an object/array by a fixed key/index path; return the leaf only if it is
 * a string, else null. Every intermediate hop is guarded, so an unexpected
 * shape (null, missing key, wrong type) yields null rather than throwing.
 */
function readPath(root: unknown, path: readonly (string | number)[]): string | null {
  let cur: unknown = root;
  for (const key of path) {
    if (cur === null || typeof cur !== 'object') return null;
    if (typeof key === 'number') {
      if (!Array.isArray(cur) || key >= cur.length) return null;
      cur = cur[key];
    } else {
      cur = (cur as Record<string, unknown>)[key];
    }
  }
  return typeof cur === 'string' ? cur : null;
}
