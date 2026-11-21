#!/usr/bin/env node
// Does a host serve the bundle? Every file a bundle's SHA256SUMS names is
// asked for over HTTP and its bytes hashed against the list. Node 22+, no
// dependencies. HANDOFF-PORTABILITY.md, phase 2: the check for a container, a
// candidate host, a mirror, and a restore.
//
//   node scripts/check-served.mjs --origin=https://mirror.example --sums=<SHA256SUMS>
//     [--base=/]          the path the site is served under
//     [--every=N]         read every Nth listed file (and always index.html,
//                         404.html, sw.js): a sample, for a host that should
//                         not be asked for 17,000 files. The output says so.
//     [--concurrency=8]
//
// --sums is a file, or an http(s) address. The list a host serves beside its
// own files proves only that the host agrees with itself; a list kept apart
// from the host (a release's, a snapshot's) proves the host has those bytes.
//
// It fails when a listed file does not answer 200 with the listed bytes; when
// a folder's address (…/) does not serve that folder's index.html; when a
// page, stylesheet, script or SVG comes with a type a browser will not take
// it as; when a page address that cannot exist answers anything but 404 with
// the bytes of 404.html, or a data address that cannot exist anything but 404
// (a host that answers every address with the home page fails here); when a
// file answers with a redirect, except …/index.html to its own folder on the
// same host, which some hosts do and the site's links never ask for; and
// when it read nothing. Files whose name starts with a dot are not asked for
// (.nojekyll): hosts differ on those and the site reads none.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseSums } from './verify-snapshot.mjs';

const MUST = ['index.html', '404.html', 'sw.js'];
// What a browser insists on: a module script or a stylesheet with another
// type is dropped, and an SVG image with one does not draw. The type is the
// header's part before any ";", whole.
const TYPES = [
  [/\.html$/, ['text/html']],
  [/\.css$/, ['text/css']],
  [/\.m?js$/, ['text/javascript', 'application/javascript', 'application/x-javascript', 'text/ecmascript', 'application/ecmascript']],
  [/\.svg$/, ['image/svg+xml']],
];
const essence = (type) => type.split(';')[0].trim().toLowerCase();
const REDIRECTS = [301, 302, 303, 307, 308];
const INDEX = 'index.html';
const dotFile = (p) => p.split('/').some((part) => part.startsWith('.'));

export function parseArgs(argv) {
  const args = { base: '/', every: 1, concurrency: 8 };
  for (const a of argv) {
    const m = a.match(/^--(origin|sums|base|every|concurrency)=(.+)$/);
    if (!m) throw new Error(`unknown argument: ${a}`);
    args[m[1]] = m[2];
  }
  if (!args.origin) throw new Error('--origin is required');
  if (!args.sums) throw new Error('--sums is required');
  const url = URL.canParse(args.origin) ? new URL(args.origin) : null;
  if (!url || !/^https?:$/.test(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`--origin must be an origin, such as https://mirror.example; put a path in --base (got ${args.origin})`);
  }
  args.origin = url.origin;
  args.base = `/${args.base.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
  for (const k of ['every', 'concurrency']) {
    args[k] = Number(args[k]);
    if (!Number.isInteger(args[k]) || args[k] < 1) throw new Error(`--${k} must be a whole number, 1 or more`);
  }
  return args;
}

// The files to read: every `every`th by path, and the ones no site does without.
export function pick(entries, every) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sorted.filter((e, i) => i % every === 0 || MUST.includes(e.path));
}

export async function checkServed({ origin, base = '/', entries, every = 1, concurrency = 8, tries = 2 }) {
  const r = { ok: false, problems: [], total: entries.length, examined: 0, skipped: 0, folders: 0, redirected: 0, typed: 0 };
  const problem = (p) => { if (r.problems.length < 200) r.problems.push(p); else r.more = (r.more || 0) + 1; };
  const sums = new Map(entries.map((e) => [e.path, e.sha256]));

  // One address, no redirect followed. A network error or a 5xx is tried again.
  const urlOf = (rel) => origin + base + rel.split('/').map(encodeURIComponent).join('/');
  const decoded = (pathname) => { try { return decodeURIComponent(pathname); } catch { return pathname; } };
  const get = async (rel) => {
    const url = urlOf(rel);
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(60000) });
        const body = Buffer.from(await res.arrayBuffer());
        last = { status: res.status, type: res.headers.get('content-type') || '', location: res.headers.get('location'), sha256: createHash('sha256').update(body).digest('hex') };
        if (res.status < 500) return last;
      } catch (e) {
        last = { error: e.cause?.code || e.cause?.message || e.message };
      }
    }
    return last;
  };
  // 200 with the listed bytes, or a problem under the address asked for.
  const served = (rel, a, want) => {
    if (a.error) { problem(`${rel}: could not be fetched (${a.error})`); return false; }
    if (a.status !== 200) { problem(`${rel}: answered ${a.status}${a.location ? ` to ${a.location}` : ''}`); return false; }
    if (a.sha256 !== want) { problem(`${rel}: the bytes served are not the listed ones`); return false; }
    return true;
  };

  const one = async (e) => {
    r.examined += 1;
    const folder = e.path.endsWith(`/${INDEX}`) ? e.path.slice(0, -INDEX.length) : e.path === INDEX ? '' : null;
    const a = await get(e.path);
    // A host may send …/index.html to its folder; the folder is then what must serve the bytes.
    // To its own folder on this host, and nowhere else.
    const to = folder !== null && !a.error && REDIRECTS.includes(a.status) && a.location && URL.canParse(a.location, urlOf(e.path))
      ? new URL(a.location, urlOf(e.path)) : null;
    const toFolder = to !== null && to.origin === new URL(origin).origin && decoded(to.pathname) === decoded(new URL(urlOf(folder)).pathname);
    if (toFolder) r.redirected += 1;
    else if (served(e.path, a, e.sha256)) {
      const rule = TYPES.find(([name]) => name.test(e.path));
      if (rule) {
        r.typed += 1;
        if (!rule[1].includes(essence(a.type))) problem(`${e.path}: served as ${a.type || 'no type'}, which a browser will not take it as`);
      }
    }
    if (folder !== null) {
      r.folders += 1;
      const f = await get(folder);
      const name = folder || '(the site\'s root)';
      if (served(name, f, e.sha256) && essence(f.type) !== 'text/html') problem(`${name}: served as ${f.type || 'no type'}, not as a page`);
    }
  };

  const todo = pick(entries, every).filter((e) => {
    if (!dotFile(e.path)) return true;
    r.skipped += 1;
    return false;
  });
  if (!todo.length) problem('examined nothing: the list names no file to ask for');
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (next < todo.length) await one(todo[next++]);
  }));

  // Addresses no build could make. A host that answers one 200 hides every
  // broken link, and a reader's fetch of a data file that is not there would
  // get a page and call it data.
  const nowhere = `check-served-${randomBytes(8).toString('hex')}`;
  if (!sums.has('404.html')) problem('the list names no 404.html, so a missing page cannot be checked');
  else {
    const a = await get(`${nowhere}/`);
    if (a.error) problem(`a missing page could not be fetched (${a.error})`);
    else if (a.status !== 404) problem(`a missing page answered ${a.status}, not 404`);
    else if (a.sha256 !== sums.get('404.html')) problem('a missing page was not answered with 404.html');
  }
  const d = await get(`data/${nowhere}.json`);
  if (d.error) problem(`a missing data file could not be fetched (${d.error})`);
  else if (d.status !== 404) problem(`a missing data file answered ${d.status}, not 404`);

  r.ok = r.problems.length === 0 && r.examined > 0;
  return r;
}

async function readSums(where) {
  if (/^https?:\/\//.test(where)) {
    const res = await fetch(where, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`${where} answered ${res.status}`);
    return res.text();
  }
  return readFileSync(where, 'utf8');
}

async function main(argv) {
  let args;
  try { args = parseArgs(argv); } catch (e) {
    console.error(`${e.message}\nusage: node scripts/check-served.mjs --origin=<https://host> --sums=<SHA256SUMS file or address> [--base=/] [--every=N] [--concurrency=8]`);
    return 2;
  }
  const entries = parseSums(await readSums(args.sums));
  const r = await checkServed({ ...args, entries });
  const where = `${args.origin}${args.base}`;
  const read = `${r.examined} of ${r.total} listed files asked for${args.every > 1 ? ` (a sample: every ${args.every}th)` : ''}, ${r.skipped} dot file${r.skipped === 1 ? '' : 's'} left out`;
  if (!r.ok) {
    console.log(`FAIL ${where}: ${r.problems.length + (r.more || 0)} problem${r.problems.length + (r.more || 0) === 1 ? '' : 's'}; ${read}`);
    for (const p of r.problems.slice(0, 40)) console.log(`  !! ${p}`);
    if (r.problems.length > 40 || r.more) console.log(`  !! and ${r.problems.length - Math.min(40, r.problems.length) + (r.more || 0)} more`);
    return 1;
  }
  const own = /^https?:\/\//.test(args.sums) && new URL(args.sums).origin === args.origin;
  console.log(`ok   ${where}: ${read}; each answered 200 with the listed bytes${r.redirected ? ` (${r.redirected} index.html addresses sent to their folder)` : ''}; `
    + `${r.folders} folder addresses serve their index; ${r.typed} pages, stylesheets, scripts and SVGs come with a type a browser takes; `
    + `a missing page answers 404 with 404.html${own ? '; the list is the host\'s own, so this proves the host agrees with itself' : ''}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
