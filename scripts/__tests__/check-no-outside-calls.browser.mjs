// node --test scripts/__tests__/check-no-outside-calls.browser.mjs
// Proofs that need Chromium, so `npm run test:scripts` does not pick them up.
// Each builds a tiny site and runs it through the same file server, proxy
// and browser the real check uses. Outside hosts are .test or .invalid names:
// the proxy refuses them all, so nothing leaves the machine.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { run, startSite } from '../check-no-outside-calls.mjs';

const made = [];
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

function fixture(files) {
  const dist = mkdtempSync(path.join(tmpdir(), 'no-outside-'));
  made.push(dist);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    writeFileSync(path.join(dist, rel), text);
  }
  return dist;
}

// An icon link, so Chromium does not ask for /favicon.ico on its own.
const page = (body) => `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>t</title>${body}<p id="done">done</p>`;
const openPage = [{ name: 'fixture page', run: async ({ page: p, url }) => { await p.goto(url); await p.waitForSelector('#done'); } }];
const check = (files, { base = '/', allow = [], visits = openPage, deaf = false, patience } = {}) =>
  run({ dist: fixture(files), base, allow, visits, deaf, patience });

test('an outside stylesheet is reported', async () => {
  const r = await check({ 'index.html': page('<link rel="stylesheet" href="https://style.outside.test/a.css">') });
  assert.equal(r.ok, false);
  assert.deepEqual(r.denied, ['style.outside.test']);
  assert.match(r.tail, /style\.outside\.test x\d+ \(first: https:\/\/style\.outside\.test\/a\.css during "fixture page"\)/);
});

test('a preconnect or dns-prefetch link is reported, though it asks for no file', async () => {
  const r = await check({ 'index.html': page('<link rel="preconnect" href="https://pre.outside.test"><link rel="dns-prefetch preconnect" href="//pre2.outside.test" crossorigin>'
    + '<link rel="DNS-Prefetch" href="https://dns.outside.test"><link rel="preconnect" href="/"><link rel="author" href="https://plain-link.outside.test/">') });
  assert.equal(r.ok, false);
  assert.deepEqual(r.denied.sort(), ['dns.outside.test', 'pre.outside.test', 'pre2.outside.test']);
  assert.match(r.tail, /pre\.outside\.test x1 \(first: https:\/\/pre\.outside\.test\/ during "fixture page"\)/);
});

test('a link hint to an allowed host is allowed, and a visit that leaves no page to read fails', async () => {
  const files = { 'index.html': page('<link rel="preconnect" href="https://pre.outside.test">') };
  const ok = await check(files, { allow: ['pre.outside.test'] });
  assert.equal(ok.ok, true, ok.tail);
  assert.deepEqual(ok.allowed, ['pre.outside.test']);
  const closed = await check(files, { visits: [{ name: 'closes', run: async ({ page: p, url }) => { await p.goto(url); await p.close(); } }] });
  assert.equal(closed.ok, false);
  assert.match(closed.tail, /visit "closes" failed/);
});

test('a fetch from a service worker is reported', async () => {
  const r = await check({
    'index.html': page(`<script>
      navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready)
        .then(() => { const p = document.createElement('p'); p.id = 'ready'; document.body.append(p); });
    </script>`),
    'sw.js': `self.addEventListener('install', (e) => e.waitUntil(fetch('https://sw.outside.test/ping', { mode: 'no-cors' }).catch(() => {})));`,
  }, { visits: [{ name: 'worker', run: async ({ page: p, url }) => { await p.goto(url); await p.waitForSelector('#ready', { state: 'attached' }); } }] });
  assert.deepEqual(r.denied, ['sw.outside.test']);
  assert.match(r.tail, /during "worker"/);
});

test('an outside img, sendBeacon and wss: socket are reported', async () => {
  const r = await check({ 'index.html': page(`<img src="https://img.outside.test/a.png" alt="">
    <script>
      navigator.sendBeacon('https://beacon.outside.test/b', 'x');
      try { new WebSocket('wss://socket.outside.test/s'); } catch {}
    </script>`) });
  assert.equal(r.ok, false);
  assert.deepEqual([...r.denied].sort(), ['beacon.outside.test', 'img.outside.test', 'socket.outside.test']);
});

test('a clean page: ok, and the site’s own requests are not counted as outside', async () => {
  const r = await check({ 'index.html': page('<img src="a.svg" alt=""><script src="a.js"></script>'), 'a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'a.js': '1;' });
  assert.equal(r.ok, true, r.tail);
  assert.deepEqual(r.hosts, []);
  assert.match(r.tail, /^1 of 1 visits, 3 requests to the site \(0 not found\), 0 outside hosts asked for; control seen$/);
});

test('a call to this machine on another port, or by another name, is reported', async () => {
  const r = await check({ 'index.html': page('<img src="http://127.0.0.1:54321/pixel" alt=""><img src="http://localhost:54322/pixel" alt=""><link rel="preconnect" href="http://127.0.0.1:54323">') });
  assert.equal(r.ok, false);
  assert.deepEqual(r.denied.sort(), ['127.0.0.1:54321', '127.0.0.1:54323', 'localhost:54322']);
});

test('a link hint inside a frame is reported', async () => {
  const r = await check({ 'index.html': page('<iframe src="frame.html"></iframe>'), 'frame.html': page('<link rel="dns-prefetch" href="//framed.outside.test">') });
  assert.deepEqual(r.denied, ['framed.outside.test']);
});

test('a second window the page opens is read too: its link hints and its errors', async () => {
  const opener = page('<script>window.open("other.html");</script>');
  const hint = await check({ 'index.html': opener, 'other.html': page('<link rel="dns-prefetch" href="//window.outside.test">') });
  assert.deepEqual(hint.denied, ['window.outside.test']);
  const error = await check({ 'index.html': opener, 'other.html': page('<script>throw new Error("boom in the other window")</script>') });
  assert.equal(error.ok, false);
  assert.match(error.tail, /1 uncaught page error;/);
});

test('a page that never stops asking for files fails its visit', async () => {
  const r = await check({ 'index.html': page('<script>setInterval(() => fetch("a.txt?" + Math.random()), 100);</script>'), 'a.txt': 'x' }, { patience: 2500 });
  assert.equal(r.ok, false);
  assert.match(r.tail, /visit "fixture page" failed: the site was still asking for files after 2\.5 seconds/);
});

test('an allowed host is ok and printed as allowed; another port or a subdomain is not', async () => {
  const ok = await check({ 'index.html': page('<img src="https://allowed.test/a.png" alt="">') }, { allow: ['allowed.test'] });
  assert.equal(ok.ok, true, ok.tail);
  assert.deepEqual(ok.allowed, ['allowed.test']);
  assert.ok(ok.lines.some((l) => l.startsWith('  allowed (refused all the same): allowed.test x')));
  assert.match(ok.tail, /1 outside host asked for, it allowed \(allowed\.test x\d+\); control seen$/);

  const no = await check({ 'index.html': page('<img src="https://allowed.test:8443/a.png" alt=""><img src="https://sub.allowed.test/a.png" alt="">') }, { allow: ['allowed.test'] });
  assert.equal(no.ok, false);
  assert.deepEqual([...no.denied].sort(), ['allowed.test:8443', 'sub.allowed.test']);
});

test('a deaf recorder fails the control and runs no visit', async () => {
  const r = await check({ 'index.html': page('') }, { deaf: true });
  assert.equal(r.ok, false);
  assert.match(r.tail, /^the block is not working/);
  assert.match(r.tail, /0 of 1 visits, 0 requests to the site/);
});

test('a page asking for a missing local file fails on the 404', async () => {
  const r = await check({ 'index.html': page('<img src="missing.png" alt="">') });
  assert.equal(r.ok, false);
  assert.match(r.tail, /1 site request came back 404/);
  assert.ok(r.lines.includes('  not found: /missing.png during "fixture page"'), r.lines.join('\n'));
});

test('a visit that fails, or touches nothing, fails the run by name', async () => {
  const thrown = await check({ 'index.html': page('') }, { visits: [{ name: 'broken', run: () => { throw new Error('no such thing'); } }] });
  assert.match(thrown.tail, /visit "broken" failed: no such thing/);
  assert.match(thrown.tail, /1 visit did not run: broken/);
  const idle = await check({ 'index.html': page('') }, { visits: [{ name: 'idle', run: async () => {} }] });
  assert.equal(idle.ok, false);
  assert.match(idle.tail, /the site got no requests: nothing was examined/);
});

test('an uncaught page error fails the run; a console error alone does not', async () => {
  const thrown = await check({ 'index.html': page('<script>throw new Error("boom")</script>') });
  assert.equal(thrown.ok, false);
  assert.match(thrown.tail, /1 uncaught page error;/);
  assert.ok(thrown.lines.some((l) => l.includes('page error during "fixture page": boom')), thrown.lines.join('\n'));
  const logged = await check({ 'index.html': page('<script>console.error("noted")</script>') });
  assert.equal(logged.ok, true, logged.tail);
  assert.ok(logged.lines.includes('  console errors: 1'), logged.lines.join('\n'));
});

function get(port, rawPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: rawPath }, (res) => { res.resume(); resolve(res.statusCode); }).on('error', reject);
  });
}

test('the base path: / and /sub/ behave the same, and nothing outside the base is served', async () => {
  const files = { 'index.html': page('<img src="a.svg" alt="">'), 'a.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>', 'dir/index.html': page('') };
  const atRoot = await check(files);
  const atSub = await check(files, { base: '/sub/' });
  assert.equal(atRoot.ok, true, atRoot.tail);
  assert.equal(atSub.ok, true, atSub.tail);
  assert.equal(atSub.tail, atRoot.tail);

  const dist = fixture(files);
  const secret = path.join(path.dirname(dist), `secret-${path.basename(dist)}.txt`);
  writeFileSync(secret, 'secret');
  made.push(secret);
  const site = await startSite(dist, '/sub/');
  try {
    assert.equal(await get(site.port, '/sub/'), 200);
    assert.equal(await get(site.port, '/sub/a.svg'), 200);
    assert.equal(await get(site.port, '/sub/dir/'), 200);
    assert.equal(await get(site.port, '/sub/dir'), 301);
    assert.equal(await get(site.port, '/sub'), 301);
    assert.equal(await get(site.port, '/a.svg'), 404);
    assert.equal(await get(site.port, '/other/a.svg'), 404);
    assert.equal(await get(site.port, `/sub/../secret-${path.basename(dist)}.txt`), 404);
    assert.equal(await get(site.port, `/sub/%2e%2e/secret-${path.basename(dist)}.txt`), 404);
    assert.equal(await get(site.port, `/sub/..%2fsecret-${path.basename(dist)}.txt`), 404);
    assert.equal(site.missing.length, 5);
  } finally {
    await site.close();
  }
});
