import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSearchOffsets } from '../lib/data';

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__;
});

describe('fetchSearchOffsets', () => {
  it('honours globalThis.__ARISTOTLE_DATA_ROOT__', async () => {
    (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ =
      'asset://localhost/corpus';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token_count: 3 }),
    } as Response);

    await expect(fetchSearchOffsets('EN')).resolves.toEqual({ token_count: 3 });
    expect(fetchMock).toHaveBeenCalledWith('asset://localhost/corpus/EN/search/offsets.json');
  });

  it('falls back to BASE_URL/data when the override is unset', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ token_count: 1 }),
    } as Response);

    await fetchSearchOffsets('Cat');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/data\/Cat\/search\/offsets\.json$/);
  });
});

// PUBLIC_DATA_ROOT (the Cloudflare build, data on R2; docs/cloudflare.md) is
// read into a top-level const at build time, so each case stubs the env and
// imports a fresh copy of the module.
describe('PUBLIC_DATA_ROOT build-time root', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const okJson = (body: unknown) => vi.spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok: true, json: async () => body } as Response);

  it('roots data.ts fetches there, without a trailing slash', async () => {
    vi.stubEnv('PUBLIC_DATA_ROOT', 'https://data.example.com/');
    vi.resetModules();
    const fresh = await import('../lib/data');
    const fetchMock = okJson({ token_count: 1 });
    await fresh.fetchSearchOffsets('EN');
    expect(fetchMock).toHaveBeenCalledWith('https://data.example.com/EN/search/offsets.json');
  });

  it('roots search.ts fetches there too', async () => {
    vi.stubEnv('PUBLIC_DATA_ROOT', 'https://data.example.com');
    vi.resetModules();
    const fresh = await import('../lib/search');
    const fetchMock = okJson({});
    await fresh.loadEngChapters('EN');
    expect(fetchMock).toHaveBeenCalledWith('https://data.example.com/EN/search/eng-chapters.json');
  });

  it('still loses to the desktop override', async () => {
    vi.stubEnv('PUBLIC_DATA_ROOT', 'https://data.example.com');
    vi.resetModules();
    const fresh = await import('../lib/data');
    (globalThis as { __ARISTOTLE_DATA_ROOT__?: string }).__ARISTOTLE_DATA_ROOT__ = 'asset://localhost/corpus';
    const fetchMock = okJson({ token_count: 1 });
    await fresh.fetchSearchOffsets('Cat');
    expect(fetchMock).toHaveBeenCalledWith('asset://localhost/corpus/Cat/search/offsets.json');
  });
});
