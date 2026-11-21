// scripts/check-served.mjs: does a host serve the bundle's files? The failing
// cases come first; each is a way a real host goes wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

import { checkServed, parseArgs, pick } from '../check-served.mjs';

const sha = (body) => createHash('sha256').update(body).digest('hex');
const TYPES = { html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml', woff2: 'font/woff2' };

const FILES = () => ({
  'index.html': '<h1>home</h1>',
  '404.html': '<h1>not here</h1>',
  'sw.js': 'self.x = 1;',
  'Cat/book/1/index.html': '<p>Categories</p>',
  'data/Cat/book-01.json': '{"a":1}',
  'fonts/fonts.css': '@font-face {}',
  'fonts/a.woff2': 'wOF2....',
  'favicon.svg': '<svg/>',
  '.nojekyll': '',
});

// A plain static host for `files` under `base`, bent by `bend(req path, answer)`:
// bend may change the answer or return another.
async function host(files, { base = '/', bend = (p, a) => a } = {}) {
  const answer = (rel) => {
    const type = (name) => TYPES[name.split('.').pop()] || 'application/octet-stream';
    if (rel in files) return { status: 200, body: files[rel], type: type(rel) };
    const index = `${rel}index.html`;
    if ((rel === '' || rel.endsWith('/')) && index in files) return { status: 200, body: files[index], type: TYPES.html };
    return { status: 404, body: files['404.html'] ?? 'nothing', type: TYPES.html };
  };
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const a = p.startsWith(base) ? bend(p.slice(base.length), answer(p.slice(base.length))) : { status: 404, body: 'off base', type: 'text/plain' };
    res.writeHead(a.status, { 'content-type': a.type, ...(a.location ? { location: a.location } : {}) });
    res.end(a.body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const entriesOf = (files) => Object.entries(files).map(([path, body]) => ({ path, sha256: sha(body) }));

async function run(opts = {}, files = FILES(), listed = files) {
  const h = await host(files, opts);
  try {
    return await checkServed({ origin: h.origin, base: opts.base ?? '/', entries: entriesOf(listed), every: opts.every ?? 1, tries: 1 });
  } finally {
    await h.close();
  }
}

const fails = (name, opts, pattern, files, listed) => test(`check-served: ${name} fails`, async () => {
  const r = await run(opts, files, listed);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => pattern.test(p)), `no problem matched ${pattern}: ${JSON.stringify(r.problems)}`);
});

{
  const files = FILES();
  delete files['data/Cat/book-01.json'];
  fails('a listed file the host does not have', {}, /data\/Cat\/book-01\.json: answered 404/, files, FILES());
}
fails('a file with a changed byte', { bend: (p, a) => (p === 'sw.js' ? { ...a, body: 'self.x = 2;' } : a) }, /sw\.js: the bytes served are not the listed ones/);
fails('a folder address that does not serve its index', { bend: (p, a) => (p === 'Cat/book/1/' ? { status: 403, body: 'no listing', type: 'text/plain' } : a) }, /Cat\/book\/1\/: answered 403/);
fails('a folder address that serves another page', { bend: (p, a) => (p === 'Cat/book/1/' ? { ...a, body: '<h1>home</h1>' } : a) }, /Cat\/book\/1\/: the bytes served are not the listed ones/);
fails('a host that answers a missing page with 200 and the home page',
  { bend: (p, a) => (a.status === 404 ? { status: 200, body: '<h1>home</h1>', type: TYPES.html } : a) }, /a missing page answered 200/);
fails('a host whose 404 is not the site\'s 404 page', { bend: (p, a) => (a.status === 404 ? { ...a, body: 'nginx 404' } : a) }, /a missing page was not answered with 404\.html/);
fails('a script served as plain text', { bend: (p, a) => (p === 'sw.js' ? { ...a, type: 'text/plain' } : a) }, /sw\.js: served as text\/plain/);
fails('a stylesheet served as a download', { bend: (p, a) => (p === 'fonts/fonts.css' ? { ...a, type: 'application/octet-stream' } : a) }, /fonts\/fonts\.css: served as application\/octet-stream/);
fails('a file that redirects somewhere else', { bend: (p, a) => (p === 'favicon.svg' ? { status: 302, body: '', type: 'text/plain', location: '/elsewhere.svg' } : a) }, /favicon\.svg: answered 302/);
fails('an index.html that redirects to somewhere other than its folder',
  { bend: (p, a) => (p === 'Cat/book/1/index.html' ? { status: 308, body: '', type: 'text/plain', location: '/' } : a) }, /Cat\/book\/1\/index\.html: answered 308 to \//);
fails('an index.html that redirects to its folder on another host',
  { bend: (p, a) => (p === 'Cat/book/1/index.html' ? { status: 308, body: '', type: 'text/plain', location: 'https://other.example/Cat/book/1/' } : a) }, /Cat\/book\/1\/index\.html: answered 308 to https:\/\/other\.example/);
fails('an index.html that redirects to its folder on another host, written without a scheme',
  { bend: (p, a) => (p === 'Cat/book/1/index.html' ? { status: 308, body: '', type: 'text/plain', location: '//other.example/Cat/book/1/' } : a) }, /Cat\/book\/1\/index\.html: answered 308 to \/\/other\.example/);
fails('an index.html answered 304 with a Location', { bend: (p, a) => (p === 'Cat/book/1/index.html' ? { status: 304, body: '', type: 'text/plain', location: '/Cat/book/1/' } : a) }, /Cat\/book\/1\/index\.html: answered 304/);
fails('a stylesheet with a type that only starts like the right one', { bend: (p, a) => (p === 'fonts/fonts.css' ? { ...a, type: 'text/css-bogus' } : a) }, /fonts\/fonts\.css: served as text\/css-bogus/);
fails('a script with a type that only starts like the right one', { bend: (p, a) => (p === 'sw.js' ? { ...a, type: 'application/javascript+json' } : a) }, /sw\.js: served as application\/javascript\+json/);
fails('a host that answers a missing data file with 200 and the home page',
  { bend: (p, a) => (a.status === 404 && p.endsWith('.json') ? { status: 200, body: '<h1>home</h1>', type: TYPES.html } : a) }, /a missing data file answered 200/);
fails('a list with no 404.html', {}, /the list names no 404\.html/, FILES(), (() => { const f = FILES(); delete f['404.html']; return f; })());

test('check-served: an empty list examines nothing and fails', async () => {
  const r = await run({}, FILES(), {});
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /examined nothing/.test(p)));
});

test('check-served: a host that is not there fails and says so', async () => {
  const r = await checkServed({ origin: 'http://127.0.0.1:9', base: '/', entries: entriesOf(FILES()), tries: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => /could not be fetched/.test(p)));
});

test('check-served: a faithful host passes, and the counts say what was read', async () => {
  const r = await run();
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
  // 9 listed, 1 dot file skipped; 2 index pages, each also asked for by its folder address.
  assert.deepEqual({ total: r.total, examined: r.examined, skipped: r.skipped, folders: r.folders, redirected: r.redirected }, { total: 9, examined: 8, skipped: 1, folders: 2, redirected: 0 });
});

test('check-served: a faithful host under a base path passes, and one off its base fails', async () => {
  assert.equal((await run({ base: '/mirror/' })).ok, true);
  const h = await host(FILES(), { base: '/mirror/' });
  try {
    const r = await checkServed({ origin: h.origin, base: '/', entries: entriesOf(FILES()), tries: 1 });
    assert.equal(r.ok, false);
  } finally { await h.close(); }
});

test('check-served: a host that sends index.html to its folder passes, and the count says so', async () => {
  const r = await run({ bend: (p, a) => (p.endsWith('index.html') ? { status: 308, body: '', type: 'text/plain', location: `/${p.slice(0, -'index.html'.length)}` } : a) });
  assert.deepEqual(r.problems, []);
  assert.equal(r.redirected, 2);
});

test('check-served: a name with a space, sent to its folder in encoded form, passes', async () => {
  const files = { ...FILES(), 'a b/index.html': '<p>spaced</p>' };
  const r = await run({ bend: (p, a) => (p === 'a b/index.html' ? { status: 301, body: '', type: 'text/plain', location: '/a%20b/' } : a) }, files);
  assert.deepEqual(r.problems, []);
  assert.equal(r.redirected, 1);
});

test('check-served: every type a browser takes a script as passes', async () => {
  for (const type of ['text/javascript; charset=utf-8', 'application/javascript', 'Text/JavaScript', 'text/ecmascript']) {
    const r = await run({ bend: (p, a) => (p === 'sw.js' ? { ...a, type } : a) });
    assert.deepEqual(r.problems, [], type);
  }
});

test('check-served: a sample still reads the files a site cannot do without', () => {
  const entries = Array.from({ length: 100 }, (_, i) => ({ path: `data/f${String(i).padStart(3, '0')}.json`, sha256: 'x' }))
    .concat(['index.html', '404.html', 'sw.js'].map((path) => ({ path, sha256: 'x' })));
  const picked = pick(entries, 50).map((e) => e.path);
  for (const must of ['index.html', '404.html', 'sw.js']) assert.ok(picked.includes(must), must);
  assert.ok(picked.length >= 5 && picked.length <= 6, String(picked.length));
  assert.equal(pick(entries, 1).length, 103);
});

test('check-served: a sampled run says it read a part', async () => {
  const r = await run({ every: 4 });
  assert.equal(r.ok, true);
  assert.ok(r.examined < r.total - r.skipped, `${r.examined} of ${r.total}`);
});

test('check-served: arguments', () => {
  assert.deepEqual(parseArgs(['--origin=https://m.example/', '--sums=S']), { origin: 'https://m.example', sums: 'S', base: '/', every: 1, concurrency: 8 });
  assert.equal(parseArgs(['--origin=https://m.example', '--sums=S', '--base=mirror']).base, '/mirror/');
  assert.throws(() => parseArgs(['--sums=S']), /--origin/);
  assert.throws(() => parseArgs(['--origin=https://m.example']), /--sums/);
  assert.throws(() => parseArgs(['--origin=m.example', '--sums=S']), /origin/);
  assert.throws(() => parseArgs(['--origin=https://m.example/path', '--sums=S']), /origin/);
  assert.throws(() => parseArgs(['--origin=https://m.example', '--sums=S', '--every=0']), /every/);
  assert.throws(() => parseArgs(['--origin=https://m.example', '--sums=S', '--every=1.5']), /every/);
  assert.throws(() => parseArgs(['--origin=https://m.example', '--sums=S', '--concurrency=two']), /concurrency/);
  assert.throws(() => parseArgs(['--origin=https://m.example', '--sums=S', '--nope=1']), /unknown/);
});
