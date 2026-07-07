import { describe, expect, it, vi } from 'vitest';
import {
  ApiProvider,
  DEFAULT_MODELS,
  type ApiService,
  type FetchFn,
  type FetchResponse,
} from '../apiProvider';
import {
  API_KEY_REJECTED_MESSAGE,
  API_NO_KEY_MESSAGE,
  API_SERVICE_BUSY_MESSAGE,
  API_UNREACHABLE_MESSAGE,
} from '../messages';
import { GOLDEN_CONTEXT } from './fixtures';

/** A fetch stub that records its call and returns a canned ok/json response. */
function okFetch(json: unknown): {
  fetch: FetchFn;
  calls: { url: string; init: Parameters<FetchFn>[1] }[];
} {
  const calls: { url: string; init: Parameters<FetchFn>[1] }[] = [];
  const fetch: FetchFn = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => json };
  };
  return { fetch, calls };
}

/** A fetch stub for a non-2xx status. */
function statusFetch(status: number): FetchFn {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

// Well-formed success payloads per service (what extractText walks).
const OPENAI_OK = { choices: [{ message: { content: 'This is what it was to be.' } }] };
const ANTHROPIC_OK = { content: [{ type: 'text', text: 'This is what it was to be.' }] };
const GOOGLE_OK = {
  candidates: [{ content: { parts: [{ text: 'This is what it was to be.' }] } }],
};

const signal = () => new AbortController().signal;

describe('ApiProvider — id + missing key', () => {
  it('id is "api"', () => {
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch: okFetch({}).fetch });
    expect(provider.id).toBe('api');
  });

  it('empty key -> the "add a key" sentence, and fetch is never called', async () => {
    const { fetch, calls } = okFetch(OPENAI_OK);
    const provider = new ApiProvider({ service: 'openai', apiKey: '', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_NO_KEY_MESSAGE });
    expect(calls.length).toBe(0);
  });

  it('whitespace-only key -> the "add a key" sentence, fetch not called', async () => {
    const { fetch, calls } = okFetch(OPENAI_OK);
    const provider = new ApiProvider({ service: 'anthropic', apiKey: '   ', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_NO_KEY_MESSAGE });
    expect(calls.length).toBe(0);
  });
});

describe('ApiProvider — OpenAI happy path', () => {
  it('POSTs to the chat/completions URL with the bearer header and message shape; extracts choices[0].message.content', async () => {
    const { fetch, calls } = okFetch(OPENAI_OK);
    const provider = new ApiProvider({ service: 'openai', apiKey: 'sk-test', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());

    expect(result).toEqual({ kind: 'suggestion', text: 'This is what it was to be.' });
    expect(calls.length).toBe(1);
    const { url, init } = calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(DEFAULT_MODELS.openai);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content.length).toBeGreaterThan(0);
    expect(body.messages[1].role).toBe('user');
    expect(body.messages[1].content).toContain('>>> TARGET line to translate:');
  });
});

describe('ApiProvider — Anthropic happy path', () => {
  it('POSTs to /v1/messages with x-api-key, version, the browser-access header, and system+messages; extracts content[0].text', async () => {
    const { fetch, calls } = okFetch(ANTHROPIC_OK);
    const provider = new ApiProvider({ service: 'anthropic', apiKey: 'sk-ant', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());

    expect(result).toEqual({ kind: 'suggestion', text: 'This is what it was to be.' });
    const { url, init } = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('sk-ant');
    expect(init.headers['anthropic-version']).toBe('2023-06-01');
    // The load-bearing CORS header for the webview path.
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init.body);
    expect(body.model).toBe(DEFAULT_MODELS.anthropic);
    expect(typeof body.max_tokens).toBe('number');
    expect(typeof body.system).toBe('string');
    expect(body.system.length).toBeGreaterThan(0);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toContain('>>> TARGET line to translate:');
  });
});

describe('ApiProvider — Google happy path', () => {
  it('POSTs to generateContent with the key query param and systemInstruction/contents; extracts candidates[0].content.parts[0].text', async () => {
    const { fetch, calls } = okFetch(GOOGLE_OK);
    const provider = new ApiProvider({ service: 'google', apiKey: 'g-key', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());

    expect(result).toEqual({ kind: 'suggestion', text: 'This is what it was to be.' });
    const { url, init } = calls[0];
    expect(url).toContain(
      `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODELS.google}:generateContent`,
    );
    expect(url).toContain('key=g-key');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts[0].text.length).toBeGreaterThan(0);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[0].parts[0].text).toContain('>>> TARGET line to translate:');
  });
});

describe('ApiProvider — model override', () => {
  const cases: { service: ApiService; ok: unknown }[] = [
    { service: 'openai', ok: OPENAI_OK },
    { service: 'anthropic', ok: ANTHROPIC_OK },
    { service: 'google', ok: GOOGLE_OK },
  ];

  for (const { service, ok } of cases) {
    it(`${service}: uses the override model when set`, async () => {
      const { fetch, calls } = okFetch(ok);
      const provider = new ApiProvider({ service, apiKey: 'k', model: 'custom-model-1', fetch });
      await provider.suggest(GOLDEN_CONTEXT, signal());
      if (service === 'google') {
        expect(calls[0].url).toContain('/models/custom-model-1:generateContent');
      } else {
        expect(JSON.parse(calls[0].init.body).model).toBe('custom-model-1');
      }
    });

    it(`${service}: uses the default model when no override`, async () => {
      const { fetch, calls } = okFetch(ok);
      const provider = new ApiProvider({ service, apiKey: 'k', fetch });
      await provider.suggest(GOLDEN_CONTEXT, signal());
      if (service === 'google') {
        expect(calls[0].url).toContain(`/models/${DEFAULT_MODELS.google}:generateContent`);
      } else {
        expect(JSON.parse(calls[0].init.body).model).toBe(DEFAULT_MODELS[service]);
      }
    });
  }

  it('blank override falls back to the default model', async () => {
    const { fetch, calls } = okFetch(OPENAI_OK);
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', model: '   ', fetch });
    await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(JSON.parse(calls[0].init.body).model).toBe(DEFAULT_MODELS.openai);
  });
});

describe('ApiProvider — error status mapping (never surfaces the body)', () => {
  it('401 -> the "key didn\'t work" sentence', async () => {
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch: statusFetch(401) });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_KEY_REJECTED_MESSAGE });
  });

  it('403 -> the "key didn\'t work" sentence', async () => {
    const provider = new ApiProvider({ service: 'anthropic', apiKey: 'k', fetch: statusFetch(403) });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_KEY_REJECTED_MESSAGE });
  });

  it('429 -> the "service is busy" sentence', async () => {
    const provider = new ApiProvider({ service: 'google', apiKey: 'k', fetch: statusFetch(429) });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_SERVICE_BUSY_MESSAGE });
  });

  it('500 (other non-2xx) -> the generic unreachable sentence', async () => {
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch: statusFetch(500) });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_UNREACHABLE_MESSAGE });
  });
});

describe('ApiProvider — network / malformed / abort', () => {
  it('a thrown fetch (network failure) -> the generic sentence, error swallowed', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch: FetchFn = async () => {
      throw new Error('ECONNREFUSED api.openai.com');
    };
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_UNREACHABLE_MESSAGE });
    // Never surface the raw error text as the message.
    expect((result as { message: string }).message).not.toContain('ECONNREFUSED');
    errSpy.mockRestore();
  });

  it('malformed success body (wrong shape) -> the generic sentence', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fetch } = okFetch({ nonsense: true });
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_UNREACHABLE_MESSAGE });
    errSpy.mockRestore();
  });

  it('empty-string text in an otherwise valid body -> the generic sentence', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fetch } = okFetch({ choices: [{ message: { content: '   ' } }] });
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_UNREACHABLE_MESSAGE });
    errSpy.mockRestore();
  });

  it('json() that rejects (non-JSON body) -> the generic sentence', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetch: FetchFn = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    const provider = new ApiProvider({ service: 'anthropic', apiKey: 'k', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, signal());
    expect(result).toEqual({ kind: 'error', message: API_UNREACHABLE_MESSAGE });
    errSpy.mockRestore();
  });

  it('passes the AbortSignal to fetch', async () => {
    let seenSignal: AbortSignal | undefined;
    const fetch: FetchFn = async (_url, init) => {
      seenSignal = init.signal;
      return { ok: true, status: 200, json: async () => OPENAI_OK };
    };
    const controller = new AbortController();
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch });
    await provider.suggest(GOLDEN_CONTEXT, controller.signal);
    expect(seenSignal).toBe(controller.signal);
  });

  it('discards a late result once the signal is aborted (does not render the suggestion)', async () => {
    const controller = new AbortController();
    const fetch: FetchFn = async () => {
      controller.abort();
      return { ok: true, status: 200, json: async () => OPENAI_OK };
    };
    const provider = new ApiProvider({ service: 'openai', apiKey: 'k', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, controller.signal);
    expect(result).not.toEqual({ kind: 'suggestion', text: 'This is what it was to be.' });
    expect(result.kind).toBe('error');
  });

  it('an abort surfacing as a thrown AbortError still returns an error, not a suggestion', async () => {
    const controller = new AbortController();
    const fetch: FetchFn = async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    };
    const provider = new ApiProvider({ service: 'anthropic', apiKey: 'k', fetch });
    const result = await provider.suggest(GOLDEN_CONTEXT, controller.signal);
    expect(result.kind).toBe('error');
  });
});
