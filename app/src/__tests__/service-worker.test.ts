import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The service worker's contract is "anything you have read is available
// offline", which only holds if each cache write outlives the response. A write
// started and then abandoned (`cache.put(...)` with nothing holding the event
// open) may die when the browser ends the worker after the response is
// delivered, so every write must go to event.waitUntil().
//
// sw.js is a plain browser script, not a module: run it inside a fake
// ServiceWorkerGlobalScope and collect the listeners it registers.
// process.cwd() is app/ under vitest.
const SW_SRC = readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf8');

const ORIGIN = 'https://example.test';
const SCOPE = ORIGIN + '/';

/** Let every queued microtask and timer callback run. */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** Does this promise still have nothing to say once the queue has drained? */
async function pending(p: Promise<unknown>): Promise<boolean> {
  let settled = false;
  p.then(() => { settled = true; }, () => { settled = true; });
  await flush();
  return !settled;
}

function loadSw(
  { responseOk = true, type = 'basic', src = SW_SRC }: { responseOk?: boolean; type?: string; src?: string } = {},
) {
  const listeners = new Map<string, (event: unknown) => void>();
  let finishPut!: () => void;
  const putDone = new Promise<void>((r) => { finishPut = r; });
  const puts: string[] = [];

  const cache = {
    addAll: async () => {},
    match: async () => undefined,
    put: (request: { url: string }) => {
      puts.push(request.url);
      return putDone;
    },
  };

  const self = {
    registration: { scope: SCOPE },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    addEventListener: (name: string, fn: (event: unknown) => void) => { listeners.set(name, fn); },
  };
  const caches = { open: async () => cache, keys: async () => [], delete: async () => true };
  const fetchImpl = async () => ({
    ok: responseOk,
    type,
    marker: 'network',
    clone: () => ({ marker: 'clone' }),
  });

  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'location', src)(
    self, caches, fetchImpl, { origin: ORIGIN, href: SCOPE },
  );

  return {
    finishPut,
    puts,
    fetchEvent(url: string, mode = 'no-cors') {
      const waits: Promise<unknown>[] = [];
      let response: Promise<unknown> | undefined;
      listeners.get('fetch')!({
        request: { url, method: 'GET', mode },
        waitUntil: (p: Promise<unknown>) => { waits.push(p); },
        respondWith: (p: Promise<unknown>) => { response = p; },
      });
      return { response, waits };
    },
  };
}

const FONT = 'https://fonts.gstatic.com/s/gfsdidot/v1/font.woff2';

describe('service worker cache writes are tied to the event lifetime', () => {
  // One row per respondWith call site in sw.js, plus the opaque arm. A
  // cross-origin font arrives opaque: ok is false, and cacheFirst caches it on
  // `type === 'opaque'`. With a 'basic' response the first condition
  // short-circuits and that arm is never reached.
  it.each([
    ['network-first navigation', SCOPE + 'nicomachean-ethics/1/', 'navigate', {}],
    ['network-first corpus data', SCOPE + 'data/nicomachean-ethics/1.json', 'cors', {}],
    ['cache-first build asset', SCOPE + '_astro/Reader.abc123.css', 'no-cors', {}],
    ['cache-first font', FONT, 'cors', {}],
    ['cache-first opaque font', FONT, 'no-cors', { responseOk: false, type: 'opaque' }],
  ])('%s: holds the event open until the write settles, without delaying the response', async (_name, url, mode, opts) => {
    const sw = loadSw(opts);
    const event = sw.fetchEvent(url, mode);

    // The reader gets the network response at once: the write must not sit in
    // front of it, and this resolves while the write is still in flight.
    await expect(event.response).resolves.toMatchObject({ marker: 'network' });
    expect(sw.puts).toEqual([url]);

    // ...but the worker must not be allowed to die yet.
    expect(event.waits).toHaveLength(1);
    expect(await pending(event.waits[0])).toBe(true);

    sw.finishPut();
    expect(await pending(event.waits[0])).toBe(false);
  });

  it('does not write, or extend the event, for a failed response', async () => {
    const sw = loadSw({ responseOk: false });
    const event = sw.fetchEvent(SCOPE + 'data/nicomachean-ethics/1.json', 'cors');

    await expect(event.response).resolves.toMatchObject({ ok: false });
    expect(sw.puts).toEqual([]);
    expect(event.waits).toEqual([]);
  });
});

// The Cloudflare build moves corpus data to another origin (R2), and
// scripts/postbuild-data-root.mjs writes that root into dist/sw.js. Run the
// real script over a scratch dist, then load the worker it wrote.
describe('service worker with off-origin data (PUBLIC_DATA_ROOT)', () => {
  const DATA = 'https://data.example.com';
  const dist = mkdtempSync(path.join(tmpdir(), 'sw-root-'));
  mkdirSync(dist, { recursive: true });
  writeFileSync(path.join(dist, 'sw.js'), SW_SRC);
  execFileSync(process.execPath, ['scripts/postbuild-data-root.mjs', dist], {
    env: { ...process.env, PUBLIC_DATA_ROOT: DATA + '/' },
  });
  const src = readFileSync(path.join(dist, 'sw.js'), 'utf8');

  it('names the root in sw.js and keeps data out of the Worker upload', () => {
    expect(src).toContain(`const DATA_ROOT = "${DATA}/";`);
    expect(readFileSync(path.join(dist, '.assetsignore'), 'utf8')).toBe('data\n');
  });

  it('caches data from the root, network-first', async () => {
    const sw = loadSw({ src });
    const event = sw.fetchEvent(DATA + '/EN/book-01.json', 'cors');
    await expect(event.response).resolves.toMatchObject({ marker: 'network' });
    expect(sw.puts).toEqual([DATA + '/EN/book-01.json']);
  });

  it('leaves other origins alone', () => {
    const sw = loadSw({ src });
    expect(sw.fetchEvent('https://data.example.com.evil.test/EN/book-01.json', 'cors').response).toBeUndefined();
  });

  it('does nothing without a root', () => {
    expect(SW_SRC).toMatch(/^const DATA_ROOT = '';$/m);
    const sw = loadSw();
    expect(sw.fetchEvent(DATA + '/EN/book-01.json', 'cors').response).toBeUndefined();
  });
});
