#!/usr/bin/env node
// Copy a live site to a folder, file by file, with a checksum for each.
// HANDOFF-PORTABILITY.md, phase 0: the live sites are the only full copy of
// what they serve, so they are copied before anything else changes.
// Node 22+, no dependencies. It reads the sites only; it changes nothing.
//
//   node scripts/snapshot-live.mjs --site=<aristotle|plato|homer|plays|grammata> --out=<new folder>
//     [--paths-file=<list>]…    extra app paths to try, one per line, as a build
//                               tree names them (EN/book/1/index.html); a 404 is listed
//     [--data-keys-file=<list>] data keys for a site with no key record; a 404 fails
//     [--bucket-objects=<n>]    the bucket's object count (wrangler r2 bucket info);
//                               the run fails unless the key record accounts for it
//     [--concurrency=4]
//
// Data: every key the bucket's key record names (docs/cloudflare.md) is
// fetched from the data address and its MD5 compared with R2's ETag.
// App: Cloudflare cannot list a Worker's files, so the app is walked: the
// sitemap's pages, the paths in --paths-file, and every same-origin address
// those pages, stylesheets and scripts name, until nothing new turns up. A
// file that only a script builds the name of is found only if a list names it.
//
// Output: <out>/app/…, <out>/data/…, MANIFEST.json (each file's address,
// size, hash and how it was found; every 404 and redirect) and SHA256SUMS,
// which scripts/verify-snapshot.mjs or `shasum -a 256 -c` checks.
// Exit 1 on a fetch error, a missing key, a hash that differs, a sitemap page
// that does not answer 200, or a snapshot with nothing in it.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUMS, formatSums, pathKey } from './verify-snapshot.mjs';

export { pathKey };

const KEY_RECORD = '_deploy/keys.json';
// Never fetched from the app's address: Cloudflare's own endpoints and the
// plays' feedback form.
const SKIP = ['/cdn-cgi/', '/api/'];
export const SITES = {
  aristotle: { app: 'https://aristotle.johnhboyer.com', data: 'https://aristotle-data.johnhboyer.com', keyRecord: KEY_RECORD, skip: [...SKIP, '/data/'] },
  plato: { app: 'https://plato.johnhboyer.com', data: 'https://plato-data.johnhboyer.com', keyRecord: KEY_RECORD, skip: [...SKIP, '/data/'] },
  homer: { app: 'https://homer.johnhboyer.com', data: 'https://homer-data.johnhboyer.com', keyRecord: KEY_RECORD, skip: [...SKIP, '/data/'] },
  // The plays ship their data inside the Worker: /data/ is part of the app.
  plays: { app: 'https://greekdrama.johnhboyer.com', skip: SKIP },
  // Grammata's word packs sit in a bucket with no key record (--data-keys-file).
  // The Pages site has no sitemap, and answers a missing address with its home
  // page and a 200 (see isFallback).
  grammata: { app: 'https://grammata.pages.dev', data: 'https://pub-d505f3fd993b4e01b2ab095428d0493e.r2.dev', skip: SKIP, sitemap: false },
};
const SEEDS = ['/', '/sitemap-index.xml', '/robots.txt', '/sw.js', '/404.html', '/favicon.ico'];

export function parseArgs(argv, sites = SITES) {
  const o = { site: null, out: null, pathsFiles: [], dataKeysFile: null, bucketObjects: null, concurrency: 4 };
  for (const arg of argv) {
    const [flag, value] = arg.split(/=(.*)/s);
    if (flag === '--site' && value) o.site = value;
    else if (flag === '--out' && value) o.out = value;
    else if (flag === '--paths-file' && value) o.pathsFiles.push(value);
    else if (flag === '--data-keys-file' && value) o.dataKeysFile = value;
    else if (flag === '--bucket-objects' && /^\d+$/.test(value ?? '')) o.bucketObjects = Number(value);
    else if (flag === '--concurrency' && /^[1-4]$/.test(value ?? '')) o.concurrency = Number(value);
    else if (flag === '--concurrency') throw new Error('--concurrency must be 1 to 4');
    else throw new Error(`unknown or incomplete flag: ${arg}`);
  }
  if (!sites[o.site]) throw new Error(`--site must be one of ${Object.keys(sites).join(', ')}`);
  if (!o.out) throw new Error('--out is required');
  return o;
}

export function kindOf(contentType, pathname) {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'text/html') return 'html';
  if (type === 'text/css') return 'css';
  if (/javascript|ecmascript/.test(type)) return 'js';
  if (/(^|\/|\+)xml$/.test(type)) return 'xml';
  if (/manifest\+json$/.test(type)) return 'json';
  const ext = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase();
  return { html: 'html', css: 'css', js: 'js', mjs: 'js', xml: 'xml', webmanifest: 'json' }[ext] ?? null;
}

const unescapeHtml = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/gi, '/').replace(/&amp;/g, '&');
// A quoted root-relative or dot-relative path that ends in a file extension.
// A version query after it is allowed and dropped ("./chunk.js?v=2").
const QUOTED_PATH = /["'`]((?:\.{1,2}\/|\/)[A-Za-z0-9_@.~%/+-]+\.[A-Za-z0-9]{2,11})(?:[?#][^"'`\s]*)?["'`]/g;
// The bundler's own lists name files from the site root with no leading
// slash: ["_astro/Lazy.Ab12Cd34.js","_astro/Lazy.Zz99Yy88.css"]. A stylesheet
// that only a lazy chunk needs is named nowhere else.
const BUNDLE_NAME = /["'`](_astro\/[A-Za-z0-9_@.~%/+-]+\.[A-Za-z0-9]{2,11})(?:[?#][^"'`\s]*)?["'`]/g;
const META_URL = /new\s+URL\s*\(\s*["'`]([^"'`\s]+)["'`]\s*,\s*import\.meta\.url/g;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

// Every address a file names, resolved against its own. Other origins are
// returned too; the caller keeps the same-origin ones.
export function refsFrom(kind, text, baseUrl) {
  const found = [];
  const add = (raw) => {
    try {
      const u = new URL(raw.trim(), baseUrl);
      if (u.protocol === 'https:' || u.protocol === 'http:') found.push(u.href);
    } catch { /* not an address */ }
  };
  if (kind === 'html') {
    const html = unescapeHtml(text);
    for (const m of html.matchAll(/\b(?:href|src|poster)\s*=\s*["']([^"']+)["']/g)) add(m[1]);
    for (const m of html.matchAll(/=\s*["']((?:https?:\/\/|\.{0,2}\/)[^"'\s<>]*)["']/g)) add(m[1]);
    for (const m of html.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*["']([^"']+)["']/g)) {
      for (const part of m[1].split(',')) if (part.trim()) add(part.trim().split(/\s+/)[0]);
    }
    for (const m of html.matchAll(QUOTED_PATH)) add(m[1]);
    for (const m of html.matchAll(BUNDLE_NAME)) add(`/${m[1]}`);
    // style attributes and <style> blocks
    for (const m of html.matchAll(CSS_URL)) if (!m[1].startsWith('data:') && !m[1].startsWith('#')) add(m[1]);
  } else if (kind === 'css') {
    for (const m of text.matchAll(CSS_URL)) if (!m[1].startsWith('data:')) add(m[1]);
    for (const m of text.matchAll(/@import\s+["']([^"']+)["']/g)) add(m[1]);
  } else if (kind === 'js' || kind === 'json') {
    for (const m of text.matchAll(QUOTED_PATH)) add(m[1]);
    for (const m of text.matchAll(BUNDLE_NAME)) add(`/${m[1]}`);
    for (const m of text.matchAll(META_URL)) add(m[1]);
  } else if (kind === 'xml') {
    for (const m of text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) add(unescapeHtml(m[1]));
  }
  return [...new Set(found)];
}

// The path of a same-origin address, without query or anchor; null otherwise.
// The query is dropped on purpose: these are static hosts, where a query does
// not choose the file, and a snapshot is a folder of files.
export function samePath(href, origin, skip) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (u.origin !== origin) return null;
  if (skip.some(prefix => u.pathname.startsWith(prefix))) return null;
  return u.pathname;
}

export function localPath(pathname) {
  // A doubled slash is one slash on disk ("/a//b.js" lands on a/b.js), so it
  // is one here too, and the two addresses meet in save()'s collision check.
  const parts = pathname.split('/').slice(1).filter((p, i, all) => p !== '' || i === all.length - 1).map(decodeURIComponent);
  if (parts.some(p => p === '..' || p === '.' || p.includes('/') || p.includes('\\') || p.includes('\0'))) {
    throw new Error(`path leads outside the folder: ${pathname}`);
  }
  if (parts.at(-1) === '') parts[parts.length - 1] = 'index.html';
  return parts.join('/');
}

export function treePathToUrlPath(p) {
  if (p === 'index.html') return '/';
  if (p.endsWith('/index.html')) return `/${p.slice(0, -'index.html'.length)}`;
  return `/${p}`;
}

// R2's ETag is the object's MD5 unless it went up in parts (then it carries
// a "-" and cannot be checked): true, false, or null for "cannot tell".
export function etagMatches(body, etag) {
  const m = (etag ?? '').match(/^(?:W\/)?"([0-9a-f]{32})"$/);
  if (!m) return null;
  return createHash('md5').update(body).digest('hex') === m[1];
}

// A host with no 404 page (Cloudflare Pages) answers a missing address with
// its home page and a 200. fallbackSha is the hash of what the host sent for
// an address that cannot exist, or null when it sent a real 404. Any other
// address that returns those same bytes is a missing file, not a file.
export function isFallback(pathname, sha, fallbackSha) {
  return fallbackSha != null && pathname !== '/' && sha === fallbackSha;
}

// What became of each page the sitemap names: saved, or saved after a
// redirect. Anything else is a page live claims and does not serve.
export function sitemapCheck(named, saved, redirectTo) {
  const pages = [...named].filter(p => !p.endsWith('.xml'));
  const notOk = pages.filter((p) => {
    let at = p;
    for (let hop = 0; hop < 6 && !saved.has(at) && redirectTo.has(at); hop++) at = redirectTo.get(at);
    return !saved.has(at);
  });
  return { pages: pages.length, notOk };
}

// A page sent under a name that is not a page's: /_astro/x.js or /robots.txt
// arriving as text/html. On a host that answers a missing address with a page
// this is that page, whatever its bytes are today; on any other host it is an
// error page with a 200. Only names that end like a file a page would never
// be count: /release/1.0 and /manual.xhtml may be real pages.
const NOT_A_PAGE = /\.(?:m?js|css|json|map|xml|txt|ico|svg|png|jpe?g|gif|webp|avif|woff2?|ttf|otf|eot|pdf|wasm|bin|webmanifest|mp[34]|webm|ogg|zip|gz)$/i;
export function wrongType(pathname, contentType) {
  return (contentType ?? '').split(';')[0].trim().toLowerCase() === 'text/html' && NOT_A_PAGE.test(pathname.split('/').at(-1));
}

// Redirects that end nowhere: a loop, or a chain that stops at an address
// that was neither saved nor a plain 404.
export function deadRedirects(redirectTo, saved, notFoundPaths) {
  return [...redirectTo.keys()].filter((from) => {
    let at = from;
    for (let hop = 0; hop < 6 && redirectTo.has(at) && !saved.has(at); hop++) at = redirectTo.get(at);
    return !saved.has(at) && !notFoundPaths.has(at);
  });
}

export function audit(s) {
  const problems = [];
  if (s.appSaved === 0) problems.push('no app files were saved');
  if (s.dataExpected && s.dataSaved === 0) problems.push('no data files were saved');
  // The key record is itself a saved data file, so "saved some" is not enough.
  if (s.dataExpected && s.keyCount === 0) problems.push('the key list is empty: no data file was examined');
  if (s.etagsNotCheckable?.length) problems.push(`${s.etagsNotCheckable.length} data files came with no ETag that can be checked, so their bytes are unproven (first: ${s.etagsNotCheckable.slice(0, 3).join(', ')})`);
  if (s.probeChanged) problems.push("the host's answer to a missing address changed during the run; a copy of its home page may have been saved as a file. Run again.");
  for (const p of s.deadRedirects ?? []) problems.push(`redirect led to no file: ${p}`);
  if (s.sitemapExpected !== false && s.sitemapPages === 0) problems.push('the sitemap named no pages');
  for (const e of s.errors) problems.push(`fetch failed: ${e.url} (${e.error ?? e.status})`);
  for (const k of s.strictMissing) problems.push(`data key not served: ${k}`);
  for (const k of s.etagMismatch) problems.push(`data file does not match its ETag: ${k}`);
  for (const p of s.sitemapNotOk) problems.push(`sitemap page did not answer 200: ${p}`);
  if (s.bucketObjects != null) {
    const accounted = s.keyCount + (s.keyRecordInBucket ? 1 : 0);
    if (accounted !== s.bucketObjects) problems.push(`the bucket holds ${s.bucketObjects} objects; the key list accounts for ${accounted}`);
  }
  return problems;
}

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    let failure;
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60_000) });
      if (r.status !== 429 && r.status < 500) {
        return { status: r.status, headers: r.headers, body: Buffer.from(await r.arrayBuffer()) };
      }
      failure = { status: r.status };
    } catch (e) {
      failure = { status: 0, error: String(e.cause ?? e) };
    }
    if (attempt === 4) return failure;
    await new Promise(res => setTimeout(res, 3000 * attempt * attempt));
  }
}

const readList = (file) => readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(Boolean);

const sha256 = (body) => createHash('sha256').update(body).digest('hex');

export async function main(argv, sites = SITES) {
  const o = parseArgs(argv, sites);
  const site = sites[o.site];
  if (existsSync(o.out) && readdirSync(o.out).length) throw new Error(`${o.out} exists and is not empty`);
  mkdirSync(o.out, { recursive: true });
  const started = new Date().toISOString();
  const stamp = Date.now();
  const files = [];           // { path, url, bytes, sha256, from }
  const notFound = [], redirects = [], errors = [], strictMissing = [], etagMismatch = [], unverifiedEtags = [];
  const written = new Map();   // pathKey -> { rel, sha256, url }
  const save = (rel, body, url, from) => {
    const had = written.get(pathKey(rel));
    if (had) {
      // The same file reached by two addresses is kept once. Other bytes, or
      // another spelling a Mac cannot hold beside the first, would be lost.
      if (had.rel !== rel || had.sha256 !== sha256(body)) errors.push({ url, error: `would be saved over ${had.rel} (from ${had.url}) as ${rel}` });
      return;
    }
    written.set(pathKey(rel), { rel, sha256: sha256(body), url });
    const full = path.join(o.out, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body);
    files.push({ path: rel, url, bytes: body.length, sha256: sha256(body), from });
  };
  async function pool(queue, fn) {
    let inFlight = 0, done = 0;
    await new Promise((resolve) => {
      const next = () => {
        if (queue.length === 0 && inFlight === 0) return resolve();
        while (inFlight < o.concurrency && queue.length) {
          const item = queue.shift();
          inFlight++;
          fn(item).catch(e => errors.push({ url: item.url ?? item.path ?? item, error: String(e) })).finally(() => {
            inFlight--;
            if (++done % 1000 === 0) console.error(`  ${done} fetched, ${queue.length} waiting`);
            next();
          });
        }
      };
      next();
    });
    return done;
  }

  // Data.
  let keys = [], keyRecordInBucket = false;
  if (site.keyRecord) {
    const url = `${site.data}/${site.keyRecord}`;
    const r = await get(`${url}?snapshot=${stamp}`);
    if (r.status !== 200) throw new Error(`key record ${url}: ${r.status ?? r.error}`);
    keys = JSON.parse(r.body.toString());
    if (!Array.isArray(keys) || keys.some(k => typeof k !== 'string')) throw new Error('the key record is not a list of keys');
    keyRecordInBucket = true;
    save(`data/${site.keyRecord}`, r.body, url, 'key record');
  } else if (o.dataKeysFile) {
    keys = readList(o.dataKeysFile);
  }
  if (new Set(keys).size !== keys.length) throw new Error('the key list names a key twice');
  console.error(`${o.site}: ${keys.length} data keys`);
  const dataDone = await pool([...keys], async (key) => {
    const url = `${site.data}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const r = await get(`${url}?snapshot=${stamp}`);
    if (r.status === 404) return void strictMissing.push(key);
    if (r.status !== 200) return void errors.push({ url, status: r.status, error: r.error });
    const match = etagMatches(r.body, r.headers.get('etag'));
    if (match === false) return void etagMismatch.push(key);
    if (match === null) unverifiedEtags.push(key);
    save(`data/${localPath(`/${key}`)}`, r.body, url, 'key');
  });
  if (dataDone !== keys.length) throw new Error(`examined ${dataDone} of ${keys.length} data keys`);
  const dataSaved = files.length;

  // App.
  const seen = new Map();     // url path -> from
  const queue = [];
  const enqueue = (pathname, from, extra = {}) => {
    if (seen.has(pathname)) return;
    seen.set(pathname, from);
    queue.push({ path: pathname, from, hops: 0, ...extra });
  };
  for (const p of SEEDS) enqueue(p, 'seed');
  for (const file of o.pathsFiles) {
    for (const line of readList(file)) {
      const p = samePath(new URL(treePathToUrlPath(line), site.app).href, site.app, site.skip);
      if (p) enqueue(p, `list:${path.basename(file)}`);
    }
  }
  const sitemapNamed = new Set(), savedPaths = new Set(), redirectTo = new Map();
  const probeUrl = `${site.app}/snapshot-probe-${stamp}/no-such-file.bin`;
  const probe = await get(probeUrl);
  if (probe.status !== 200 && probe.status !== 404) throw new Error(`${probeUrl}: ${probe.status ?? probe.error}; cannot tell how this host answers a missing address`);
  const fallbackSha = probe.status === 200 ? sha256(probe.body) : null;
  if (fallbackSha) console.error(`${o.site}: a missing address answers 200 with ${probe.body.length} bytes; files equal to that page count as not found`);
  let appFetched = 0;
  const appQueued = () => seen.size;
  await pool(queue, async (item) => {
    appFetched++;
    const url = site.app + item.path;
    const r = await get(url);
    if (r.status >= 300 && r.status < 400) {
      const location = r.headers.get('location');
      redirects.push({ url, status: r.status, location });
      const target = location && item.hops < 5 ? samePath(new URL(location, url).href, site.app, site.skip) : null;
      if (!location) errors.push({ url, error: `redirect ${r.status} with no Location` });
      else if (item.hops >= 5) errors.push({ url, error: 'more than 5 redirects in a row' });
      // A page's file name outlives the redirect: /404.html answers at /404.
      const saveAs = item.saveAs ?? (item.path.endsWith('.html') ? localPath(item.path) : undefined);
      if (target) redirectTo.set(item.path, target);
      if (target && !seen.has(target)) {
        seen.set(target, item.from);
        queue.push({ path: target, from: item.from, hops: item.hops + 1, saveAs });
      }
      return;
    }
    if (r.status === 404) {
      notFound.push({ url, from: item.from });
      return;
    }
    if (r.status === 200 && isFallback(item.path, sha256(r.body), fallbackSha)) {
      notFound.push({ url, from: item.from, fallback: true });
      return;
    }
    if (r.status !== 200) {
      errors.push({ url, status: r.status, error: r.error });
      return;
    }
    if (wrongType(item.path, r.headers.get('content-type'))) {
      if (fallbackSha) notFound.push({ url, from: item.from, fallback: true });
      else errors.push({ url, error: 'a file that is not a page arrived as a page (text/html)' });
      return;
    }
    save(`app/${item.saveAs ?? localPath(item.path)}`, r.body, url, item.from);
    savedPaths.add(item.path);
    const kind = kindOf(r.headers.get('content-type'), item.path);
    if (!kind) return;
    for (const href of refsFrom(kind, r.body.toString(), url)) {
      const p = samePath(href, site.app, site.skip);
      if (!p) continue;
      if (kind === 'xml') sitemapNamed.add(p);
      enqueue(p, kind === 'xml' ? 'sitemap' : 'ref');
    }
  });
  if (appFetched !== appQueued()) throw new Error(`examined ${appFetched} of ${appQueued()} app paths`);
  const appSaved = files.length - dataSaved;
  const { pages: sitemapPages, notOk: sitemapNotOk } = sitemapCheck(sitemapNamed, savedPaths, redirectTo);
  const notFoundPaths = new Set(notFound.map(n => new URL(n.url).pathname));
  const probeAgain = await get(probeUrl);
  const probeChanged = probeAgain.status !== probe.status || (probe.status === 200 && sha256(probeAgain.body) !== fallbackSha);

  const problems = audit({
    appSaved, dataSaved, dataExpected: Boolean(site.data), sitemapExpected: site.sitemap, sitemapPages,
    errors, strictMissing, etagMismatch, sitemapNotOk, etagsNotCheckable: unverifiedEtags, probeChanged,
    deadRedirects: deadRedirects(redirectTo, savedPaths, notFoundPaths),
    keyCount: keys.length, bucketObjects: o.bucketObjects, keyRecordInBucket,
  });
  const by = (list) => Object.fromEntries(Object.entries(Object.groupBy(list, e => e.from)).map(([k, v]) => [k, v.length]));
  const manifest = {
    site: o.site, app: site.app, data: site.data ?? null, tool: 'scripts/snapshot-live.mjs', started, finished: new Date().toISOString(),
    missingAddress: { url: probeUrl, status: probe.status, sha256: fallbackSha },
    counts: {
      appSaved, dataSaved, bytes: files.reduce((n, f) => n + f.bytes, 0), sitemapPages,
      dataKeys: keys.length, bucketObjects: o.bucketObjects, etagsNotCheckable: unverifiedEtags.length,
      appFoundBy: by(files.filter(f => f.path.startsWith('app/'))), notFound: notFound.length, notFoundBy: by(notFound),
      redirects: redirects.length,
      // Listed, not failed: a link that leaves the site (a donation page) is not a missing file.
      redirectsElsewhere: redirects.filter((r) => {
        try { return Boolean(r.location) && new URL(r.location, r.url).origin !== site.app; } catch { return false; }  // a Location that is no address is already an error
      }).length,
    },
    problems, files, notFound, redirects, etagsNotCheckable: unverifiedEtags,
  };
  const manifestBody = Buffer.from(JSON.stringify(manifest, null, 1));
  writeFileSync(path.join(o.out, 'MANIFEST.json'), manifestBody);
  writeFileSync(path.join(o.out, SUMS), formatSums([
    ...files, { path: 'MANIFEST.json', sha256: createHash('sha256').update(manifestBody).digest('hex') },
  ]));
  console.log(JSON.stringify(manifest.counts, null, 2));
  for (const p of problems.slice(0, 40)) console.log(`PROBLEM ${p}`);
  if (problems.length > 40) console.log(`… and ${problems.length - 40} more problems (MANIFEST.json)`);
  return problems.length ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
