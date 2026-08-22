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
