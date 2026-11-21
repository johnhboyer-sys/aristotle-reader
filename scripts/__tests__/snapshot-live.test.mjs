// node --test scripts/__tests__/
// The pure functions of scripts/snapshot-live.mjs. No network: importing the
// script does not run its main().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { verifyTree } from '../verify-snapshot.mjs';

import {
  SITES, audit, deadRedirects, etagMatches, isFallback, kindOf, localPath, main, pathKey, wrongType, parseArgs, refsFrom, samePath, sitemapCheck, treePathToUrlPath,
} from '../snapshot-live.mjs';

const ORIGIN = 'https://aristotle.johnhboyer.com';

test('refsFrom(html) finds attributes, srcset, island urls, and quoted paths in escaped props', () => {
  const html = `<link rel="stylesheet" href="/_astro/index.Ab12Cd34.css">
    <a href="/EN/book/1/#1094a1">x</a><a href='../about/?x=1'>y</a>
    <img src="/plates/EN.webp" srcset="/plates/EN-2x.webp 2x, /plates/EN-3x.webp 3x">
    <astro-island component-url="/_astro/Reader.Zz99Yy88.js" renderer-url="/_astro/client.svelte.Qq11Ww22.js"
      props="{&quot;plate&quot;:[0,&quot;/plates/APo.webp&quot;]}"></astro-island>
    <meta property="og:image" content="${ORIGIN}/og/EN.png">
    <a href="https://plato.johnhboyer.com/">sister</a><a href="mailto:a@b.c">m</a>
    <script>navigator.serviceWorker.register('/sw.js')</script>`;
  const refs = new Set(refsFrom('html', html, `${ORIGIN}/EN/book/2/`));
  for (const want of ['/_astro/index.Ab12Cd34.css', '/EN/book/1/#1094a1', '/EN/book/about/?x=1', '/plates/EN.webp',
    '/plates/EN-2x.webp', '/plates/EN-3x.webp', '/_astro/Reader.Zz99Yy88.js', '/_astro/client.svelte.Qq11Ww22.js',
    '/plates/APo.webp', '/og/EN.png', '/sw.js']) {
    assert.ok(refs.has(ORIGIN + want), `missing ${want}`);
  }
  assert.ok(refs.has('https://plato.johnhboyer.com/'), 'other origins are returned; the caller drops them');
  assert.ok(![...refs].some(r => r.startsWith('mailto:')));
});

test('refsFrom(css) reads url() and @import; refsFrom(js) resolves relative imports', () => {
  const css = `@import "./base.css"; @font-face{src:url(/fonts/Gentium.woff2) format("woff2"),url('../f/a.woff')}`;
  assert.deepEqual(new Set(refsFrom('css', css, `${ORIGIN}/_astro/x.css`)),
    new Set([`${ORIGIN}/_astro/base.css`, `${ORIGIN}/fonts/Gentium.woff2`, `${ORIGIN}/f/a.woff`]));
  const js = 'import{a}from"./chunk.Ab12Cd34.js";const p=()=>import("./Lazy.Zz99Yy88.js");fetch(`/plates/x.webp`);const r=/\\/EN\\//;';
  assert.deepEqual(new Set(refsFrom('js', js, `${ORIGIN}/_astro/main.js`)),
    new Set([`${ORIGIN}/_astro/chunk.Ab12Cd34.js`, `${ORIGIN}/_astro/Lazy.Zz99Yy88.js`, `${ORIGIN}/plates/x.webp`]));
});

test('refsFrom(xml) reads every <loc>; an unknown kind yields nothing', () => {
  const xml = `<sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap></sitemapindex>`;
  assert.deepEqual(refsFrom('xml', xml, `${ORIGIN}/sitemap-index.xml`), [`${ORIGIN}/sitemap-0.xml`]);
  assert.deepEqual(refsFrom(null, 'href="/x.css"', ORIGIN), []);
});

test('kindOf goes by content type, then by extension', () => {
  assert.equal(kindOf('text/html; charset=utf-8', '/EN/'), 'html');
  assert.equal(kindOf('text/css', '/a'), 'css');
  assert.equal(kindOf('application/javascript', '/a'), 'js');
  assert.equal(kindOf('application/xml', '/sitemap-0.xml'), 'xml');
  assert.equal(kindOf('application/manifest+json', '/site.webmanifest'), 'json');
  assert.equal(kindOf('application/octet-stream', '/_astro/x.js'), 'js');
  assert.equal(kindOf('image/webp', '/plates/x.webp'), null);
});

test('samePath keeps same-origin paths, drops the rest and the skipped prefixes', () => {
  const skip = ['/data/', '/cdn-cgi/'];
  assert.equal(samePath(`${ORIGIN}/EN/book/1/?x=1#a`, ORIGIN, skip), '/EN/book/1/');
  assert.equal(samePath('https://plato.johnhboyer.com/', ORIGIN, skip), null);
  assert.equal(samePath(`${ORIGIN}/data/EN/book-01.json`, ORIGIN, skip), null);
  assert.equal(samePath(`${ORIGIN}/cdn-cgi/l/email-protection`, ORIGIN, skip), null);
  assert.equal(samePath('not a url', ORIGIN, skip), null);
});

test('localPath gives a folder address its index.html and refuses to leave the folder', () => {
  assert.equal(localPath('/'), 'index.html');
  assert.equal(localPath('/EN/book/1/'), 'EN/book/1/index.html');
  assert.equal(localPath('/_astro/a%20b.js'), '_astro/a b.js');
  assert.equal(localPath('/lemma/%CE%BB%CF%8C%CE%B3%CE%BF%CF%82/'), 'lemma/λόγος/index.html');
  assert.throws(() => localPath('/a/%2e%2e/b'), /outside/);
  assert.throws(() => localPath('/a/../../b'), /outside/);
});

test('treePathToUrlPath: index.html is served at its folder, other files at their own name', () => {
  assert.equal(treePathToUrlPath('index.html'), '/');
  assert.equal(treePathToUrlPath('EN/book/1/index.html'), '/EN/book/1/');
  assert.equal(treePathToUrlPath('404.html'), '/404.html');
  assert.equal(treePathToUrlPath('_astro/x.js'), '/_astro/x.js');
});

test('etagMatches: MD5 against a plain ETag; a multipart ETag cannot be checked', () => {
  const body = Buffer.from('{"a":1}');
  const md5 = createHash('md5').update(body).digest('hex');
  assert.equal(etagMatches(body, `"${md5}"`), true);
  assert.equal(etagMatches(body, `W/"${md5}"`), true);
  assert.equal(etagMatches(Buffer.from('{"a":2}'), `"${md5}"`), false);
  assert.equal(etagMatches(body, `"${md5}-3"`), null);
  assert.equal(etagMatches(body, null), null);
});

test('parseArgs: a known site is required; lists repeat; unknown flags are refused', () => {
  const o = parseArgs(['--site=plato', '--out=/tmp/x', '--paths-file=a', '--paths-file=b', '--bucket-objects=7592']);
  assert.deepEqual([o.site, o.out, o.pathsFiles, o.bucketObjects, o.concurrency], ['plato', '/tmp/x', ['a', 'b'], 7592, 4]);
  assert.ok(SITES.plato.app.startsWith('https://'));
  assert.throws(() => parseArgs(['--site=nowhere', '--out=/tmp/x']), /site/);
  assert.throws(() => parseArgs(['--site=plato']), /--out/);
  assert.throws(() => parseArgs(['--site=plato', '--out=x', '--concurrency=9']), /concurrency/);
  assert.throws(() => parseArgs(['--site=plato', '--out=x', '--nope']), /unknown/);
});

// The failing cases for the snapshot's own audit: it must say when it saved
// nothing, when a strict key is absent, and when the bucket holds more than
// the key record names.
test('audit fails an empty snapshot, a missing strict key, a bad hash, and a short key record', () => {
  const base = { appSaved: 10, dataSaved: 5, dataExpected: true, sitemapPages: 3, errors: [], strictMissing: [],
    etagMismatch: [], sitemapNotOk: [], keyCount: 5, bucketObjects: null, keyRecordInBucket: true };
  assert.deepEqual(audit(base), []);
  assert.match(audit({ ...base, appSaved: 0 }).join('\n'), /no app files/);
  assert.match(audit({ ...base, dataSaved: 0 }).join('\n'), /no data files/);
  assert.deepEqual(audit({ ...base, dataSaved: 0, dataExpected: false, keyCount: 0 }), []);
  assert.match(audit({ ...base, sitemapPages: 0 }).join('\n'), /sitemap/);
  assert.match(audit({ ...base, strictMissing: ['EN/book-01.json'] }).join('\n'), /EN\/book-01\.json/);
  assert.match(audit({ ...base, etagMismatch: ['a.json'] }).join('\n'), /a\.json/);
  assert.match(audit({ ...base, errors: [{ url: 'u', status: 503 }] }).join('\n'), /503/);
  assert.match(audit({ ...base, sitemapNotOk: ['/gone/'] }).join('\n'), /sitemap page did not answer 200: \/gone\//);
  assert.deepEqual(audit({ ...base, bucketObjects: 6 }), []);              // 5 keys + the record itself
  assert.match(audit({ ...base, bucketObjects: 9 }).join('\n'), /bucket holds 9/);
  assert.match(audit({ ...base, bucketObjects: 5, keyRecordInBucket: false, keyCount: 4 }).join('\n'), /bucket holds 5/);
});

test('sitemapCheck: a named page must be saved, straight or through a redirect', () => {
  const named = new Set(['/sitemap-0.xml', '/a/', '/b', '/gone/', '/loop']);
  const saved = new Set(['/a/', '/b/', '/sitemap-0.xml']);
  const redirectTo = new Map([['/b', '/b/'], ['/loop', '/loop2'], ['/loop2', '/loop']]);
  assert.deepEqual(sitemapCheck(named, saved, redirectTo), { pages: 4, notOk: ['/gone/', '/loop'] });
  assert.deepEqual(sitemapCheck(new Set(), saved, redirectTo), { pages: 0, notOk: [] });
});

// The failing case: a host that answers every missing address with its home
// page (Cloudflare Pages with no 404.html) must not fill the snapshot with
// copies of that page under real-looking names. Grammata's first run saved
// nine of them, robots.txt and sw.js among them, and reported no 404 at all.
test('isFallback: a 200 that is the host\'s answer to a nonsense address is a missing file', () => {
  assert.equal(isFallback('/robots.txt', 'aa', 'aa'), true);
  assert.equal(isFallback('/ag/641/', 'aa', 'aa'), true);
  assert.equal(isFallback('/', 'aa', 'aa'), false);            // the home page itself
  assert.equal(isFallback('/robots.txt', 'bb', 'aa'), false);
  assert.equal(isFallback('/robots.txt', 'aa', null), false);  // the host gives real 404s
});

// Review findings, 2026-11-20 (Codex). Each failed before its fix.
test('refsFrom(html) reads url() in style attributes and <style>; refsFrom(js) reads bundler lists', () => {
  const html = '<div style="background-image:url(/img/bg.webp)"></div><style>.x{background:url("/img/two.webp")}</style>';
  const refs = new Set(refsFrom('html', html, `${ORIGIN}/EN/`));
  assert.ok(refs.has(`${ORIGIN}/img/bg.webp`) && refs.has(`${ORIGIN}/img/two.webp`));
  const js = 'const d=["_astro/lazy.Ab12Cd34.js","_astro/lazy.Zz99Yy88.css"];import("./chunk.js?v=2");new URL("asset.svg",import.meta.url)';
  assert.deepEqual(new Set(refsFrom('js', js, `${ORIGIN}/_astro/main.js`)), new Set([
    `${ORIGIN}/_astro/lazy.Ab12Cd34.js`, `${ORIGIN}/_astro/lazy.Zz99Yy88.css`, `${ORIGIN}/_astro/chunk.js`, `${ORIGIN}/_astro/asset.svg`]));
});

test('audit fails an empty key list, an unchecked ETag, and a host whose missing-address answer moved', () => {
  const base = { appSaved: 10, dataSaved: 5, dataExpected: true, sitemapPages: 3, errors: [], strictMissing: [],
    etagMismatch: [], sitemapNotOk: [], keyCount: 5, bucketObjects: null, keyRecordInBucket: true };
  assert.match(audit({ ...base, dataSaved: 1, keyCount: 0 }).join('\n'), /key list is empty/);
  assert.match(audit({ ...base, etagsNotCheckable: ['a.json', 'b.json'] }).join('\n'), /2 data files .* no ETag .* a\.json/);
  assert.match(audit({ ...base, probeChanged: true }).join('\n'), /missing address changed/);
  assert.match(audit({ ...base, errors: [{ url: 'u', status: 0, error: 'connection refused' }] }).join('\n'), /connection refused/);
});

test('pathKey: names that are one file on a Mac share a key', () => {
  assert.equal(pathKey('app/A.js'), pathKey('app/a.js'));
  assert.equal(pathKey('app/\u00e9.js'), pathKey('app/e\u0301.js'));
  assert.notEqual(pathKey('app/a.js'), pathKey('app/b.js'));
});

test('deadRedirects: a redirect must end at a saved file or a plain 404', () => {
  const to = new Map([['/a', '/a/'], ['/old.html', '/old'], ['/x', '/y'], ['/y', '/x']]);
  assert.deepEqual(deadRedirects(to, new Set(['/a/']), new Set(['/old'])), ['/x', '/y']);
  assert.deepEqual(deadRedirects(new Map(), new Set(), new Set()), []);
});

// main() against a small site on this machine. `over` changes what the host sends.
async function snapshot(over = {}) {
  const md5 = (b) => createHash('md5').update(b).digest('hex');
  const routes = {
    '/': ['text/html', '<a href="/a/">a</a><link rel="stylesheet" href="/_astro/x.css"><script type="module" src="/_astro/m.js"></script><div style="background:url(/img/bg.webp)"></div>'],
    '/a/': ['text/html', '<p>a</p>'],
    '/_astro/x.css': ['text/css', 'p{color:red}'],
    '/_astro/m.js': ['text/javascript', 'const d=["_astro/lazy.js","_astro/lazy.css"];import("./lazy.js")'],
    '/_astro/lazy.js': ['text/javascript', 'export{}'],
    '/_astro/lazy.css': ['text/css', 'i{color:blue}'],
    '/img/bg.webp': ['image/webp', 'RIFF'],
    '/sitemap-index.xml': ['application/xml', '<sitemapindex><sitemap><loc>ORIGIN/sitemap-0.xml</loc></sitemap></sitemapindex>'],
    '/sitemap-0.xml': ['application/xml', '<urlset><url><loc>ORIGIN/</loc></url><url><loc>ORIGIN/a/</loc></url></urlset>'],
    '/bucket/_deploy/keys.json': ['application/json', '["w/book-01.json"]'],
    '/bucket/w/book-01.json': ['application/json', '{"n":1}'],
    ...over.routes,
  };
  let hits = 0;
  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const pathname = new URL(req.url, origin).pathname;
    const custom = over.respond?.(pathname, ++hits, res);
    if (custom) return;
    const hit = routes[pathname];
    if (!hit) { res.writeHead(404, { 'content-type': 'text/plain' }); return void res.end('no'); }
    const body = Buffer.from(hit[1].replaceAll('ORIGIN', origin));
    const headers = { 'content-type': hit[0] };
    if (pathname.startsWith('/bucket/') && !over.noEtag) headers.etag = `"${md5(body)}"`;
    res.writeHead(200, headers);
    res.end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const out = mkdtempSync(path.join(tmpdir(), 'snapshot-live-'));
  const log = console.log, err = console.error;
  const lines = [];
  console.log = console.error = (...a) => lines.push(a.join(' '));
  try {
    const sites = { test: { app: origin, data: `${origin}/bucket`, keyRecord: '_deploy/keys.json', skip: ['/bucket/'] } };
    const code = await main(['--site=test', `--out=${out}`], sites);
    const manifest = JSON.parse(readFileSync(path.join(out, 'MANIFEST.json'), 'utf8'));
    // Read the folder now: it is gone by the time the caller looks.
    const onDisk = new Set(manifest.files.map(f => f.path).filter(p => existsSync(path.join(out, p))));
    return { code, manifest, has: (p) => onDisk.has(p), verify: verifyTree(out), text: lines.join('\n') };
  } finally {
    console.log = log; console.error = err;
    rmSync(out, { recursive: true, force: true });
    await new Promise(r => server.close(r));
  }
}

test('main: a whole small site is saved, lazy stylesheet and inline background included, and verifies', async () => {
  const r = await snapshot();
  assert.equal(r.code, 0, r.text);
  for (const p of ['app/index.html', 'app/a/index.html', 'app/_astro/lazy.css', 'app/_astro/lazy.js', 'app/img/bg.webp', 'data/w/book-01.json', 'data/_deploy/keys.json']) {
    assert.ok(r.has(p), `missing ${p}`);
  }
  assert.equal(r.verify.ok, true);
  assert.equal(r.manifest.counts.sitemapPages, 2);
});

test('main: a data file with no ETag fails the run', async () => {
  const r = await snapshot({ noEtag: true });
  assert.equal(r.code, 1);
  assert.match(r.manifest.problems.join('\n'), /no ETag/);
});

test('main: an empty key record fails the run', async () => {
  const r = await snapshot({ routes: { '/bucket/_deploy/keys.json': ['application/json', '[]'] } });
  assert.equal(r.code, 1);
  assert.match(r.manifest.problems.join('\n'), /key list is empty/);
});

test('main: two addresses that are one file on a Mac fail the run', async () => {
  const r = await snapshot({ routes: {
    '/a/': ['text/html', '<script src="/_astro/Clash.js"></script><script src="/_astro/clash.js"></script>'],
    '/_astro/Clash.js': ['text/javascript', 'export const a=1'],
    '/_astro/clash.js': ['text/javascript', 'export const a=2'],
  } });
  assert.equal(r.code, 1);
  assert.match(r.manifest.problems.join('\n'), /saved over/);
});

test('main: a redirect with nowhere to go, and a redirect loop, fail the run', async () => {
  const bare = await snapshot({
    routes: { '/a/': ['text/html', '<script src="/_astro/gone.js"></script>'] },
    respond: (p, n, res) => p === '/_astro/gone.js' && (res.writeHead(302), res.end(), true),
  });
  assert.equal(bare.code, 1);
  assert.match(bare.manifest.problems.join('\n'), /gone\.js.*no Location/);
  const loop = await snapshot({
    routes: { '/a/': ['text/html', '<script src="/_astro/x.js"></script>'] },
    respond: (p, n, res) => (p === '/_astro/x.js' || p === '/_astro/y.js')
      && (res.writeHead(307, { location: p === '/_astro/x.js' ? '/_astro/y.js' : '/_astro/x.js' }), res.end(), true),
  });
  assert.equal(loop.code, 1);
  assert.match(loop.manifest.problems.join('\n'), /redirect.*no file/);
});

test('main: a host that answers 200 to anything gets no copies of its home page, and a moving answer fails', async () => {
  const home = '<a href="/a/">a</a>';
  const steady = await snapshot({ respond: (p, n, res) => !/^\/(a\/|bucket\/|sitemap)/.test(p)
    && (res.writeHead(200, { 'content-type': 'text/html' }), res.end(home), true) });
  assert.equal(steady.code, 0, steady.text);
  assert.ok(steady.has('app/index.html') && !steady.has('app/robots.txt') && !steady.has('app/sw.js'));
  assert.ok(steady.manifest.notFound.some(n => n.fallback && n.url.endsWith('/robots.txt')));
  const moving = await snapshot({ respond: (p, n, res) => !/^\/(a\/|bucket\/|sitemap)/.test(p)
    && (res.writeHead(200, { 'content-type': 'text/html' }), res.end(`${home}<!-- ${n} -->`), true) });
  assert.equal(moving.code, 1);
  assert.match(moving.manifest.problems.join('\n'), /missing address changed/);
});

// Second review pass, 2026-11-20 (Codex).
test('localPath: a doubled slash is one slash on disk, so it must be one in the name', () => {
  assert.equal(localPath('/a//b.js'), 'a/b.js');
  assert.equal(localPath('/a//'), 'a/index.html');
});

test('refsFrom(js): a bundle name with a version query, and new URL with a space before the bracket', () => {
  const js = 'const d=["_astro/x.Ab12Cd34.js?v=2"];new URL ("asset2.svg", import.meta.url)';
  assert.deepEqual(new Set(refsFrom('js', js, `${ORIGIN}/_astro/main.js`)),
    new Set([`${ORIGIN}/_astro/x.Ab12Cd34.js`, `${ORIGIN}/_astro/asset2.svg`]));
});

test('wrongType: a page sent under a name that is not a page', () => {
  assert.equal(wrongType('/_astro/x.js', 'text/html; charset=utf-8'), true);
  assert.equal(wrongType('/robots.txt', 'text/html'), true);
  assert.equal(wrongType('/_astro/x.js', 'text/javascript'), false);
  assert.equal(wrongType('/a/', 'text/html'), false);
  assert.equal(wrongType('/404.html', 'text/html'), false);
  assert.equal(wrongType('/ag/641', 'text/html'), false);      // no extension: could be a page
  assert.equal(wrongType('/x.js', null), false);
  // Third review pass: pages a healthy host may serve at odd names.
  for (const p of ['/manual.HTML', '/manual.xhtml', '/release/1.0', '/v2.3/']) assert.equal(wrongType(p, 'text/html'), false, p);
  assert.equal(wrongType('/_astro/X.JS', 'text/html'), true);
});

test('main: a moving fallback page is still not saved under a file name', async () => {
  const r = await snapshot({ respond: (p, n, res) => !/^\/(a\/|bucket\/|sitemap)/.test(p)
    && (res.writeHead(200, { 'content-type': 'text/html' }), res.end(`<a href="/a/">a</a><!-- ${n} -->`), true) });
  assert.ok(!r.has('app/robots.txt') && !r.has('app/sw.js') && !r.has('app/favicon.ico'), r.text);
});

test('main: a script that arrives as a page fails the run on a host with real 404s', async () => {
  const r = await snapshot({ routes: { '/_astro/lazy.js': ['text/html', '<p>error</p>'] } });
  assert.equal(r.code, 1);
  assert.match(r.manifest.problems.join('\n'), /lazy\.js.*arrived as a page/);
  assert.ok(!r.has('app/_astro/lazy.js'));
});

test('main: seven redirects in a row fail the run; a redirect to another site is counted and does not', async () => {
  const chain = await snapshot({
    routes: { '/a/': ['text/html', '<script src="/_astro/hop0.js"></script>'] },
    respond: (p, n, res) => {
      const m = p.match(/^\/_astro\/hop(\d)\.js$/);
      return m && (res.writeHead(307, { location: `/_astro/hop${Number(m[1]) + 1}.js` }), res.end(), true);
    },
  });
  assert.equal(chain.code, 1);
  assert.match(chain.manifest.problems.join('\n'), /more than 5 redirects/);
  const away = await snapshot({
    routes: { '/a/': ['text/html', '<a href="/support">give</a>'] },
    respond: (p, n, res) => p === '/support' && (res.writeHead(302, { location: 'https://example.invalid/give' }), res.end(), true),
  });
  assert.equal(away.code, 0, away.text);
  assert.equal(away.manifest.counts.redirectsElsewhere, 1);
  // A Location that is no address is an error, and the manifest is still written.
  const broken = await snapshot({
    routes: { '/a/': ['text/html', '<a href="/support">give</a>'] },
    respond: (p, n, res) => p === '/support' && (res.writeHead(302, { location: 'http://[' }), res.end(), true),
  });
  assert.equal(broken.code, 1);
  assert.equal(broken.manifest.counts.redirectsElsewhere, 0);
});
