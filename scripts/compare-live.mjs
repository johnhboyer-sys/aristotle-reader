#!/usr/bin/env node
// Compares a Cloudflare deploy (app on a Worker, data on R2) with the live
// GitHub Pages site, file by file.
//
// GitHub Pages serves the gh-pages branch byte for byte, so the branch's tree
// stands in for live: every file in it is fetched from the Cloudflare side and
// its git blob hash compared with the tree's. A small random sample is also
// fetched from live itself, to prove the tree is what live serves. Live gets
// only that sample; a full pass over live once showed up as a traffic spike.
//
//   node scripts/compare-live.mjs --app=https://aristotle-reader.johnhboyer.workers.dev \
//     --data=https://pub-….r2.dev [--ref=origin/gh-pages] [--concurrency=4] \
//     [--live=https://aristotle.johnhboyer.com --live-sample=40] [--out=report.json]
//
// Paths under data/ are fetched from --data, the rest from --app. A file that
// differs is put in one of these classes:
//   html-hash-only  page HTML equal once bundle names, Svelte class hashes and
//                   island ids are masked (see maskAstro);
//   astro           a bundle whose name is not in the new build (renamed);
//   sw              sw.js (carries the data root by design);
//   other           anything else: a real difference.
// Exit 1 on any missing file, fetch error, or "other" difference.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (!m) throw new Error(`bad argument ${a}`);
  return [m[1], m[2] ?? '1'];
}));
const APP = args.app?.replace(/\/+$/, '');
const DATA = args.data?.replace(/\/+$/, '');
if (!APP || !DATA) throw new Error('--app and --data are required');
const REF = args.ref ?? 'origin/gh-pages';
const CONCURRENCY = Math.min(Number(args.concurrency ?? 4), 4);
const LIVE = (args.live ?? 'https://aristotle.johnhboyer.com').replace(/\/+$/, '');
const LIVE_SAMPLE = Number(args['live-sample'] ?? 40);

const blobSha = (buf) => createHash('sha1')
  .update(`blob ${buf.length}\0`).update(buf).digest('hex');
const git = (...a) => execFileSync('git', a, { maxBuffer: 1 << 30 });

const tree = git('ls-tree', '-r', '-z', REF).toString().split('\0').filter(Boolean).map(line => {
  const [meta, path] = line.split('\t');
  return { path, sha: meta.split(' ')[2] };
});
// GitHub Pages' own files, which Cloudflare neither needs nor serves.
const SKIP = new Set(['CNAME', '.nojekyll']);
const files = tree.filter(f => !SKIP.has(f.path));

// index.html is served at its folder's address on both hosts.
const urlPath = (p) => p === 'index.html' ? '' : p.endsWith('/index.html') ? p.slice(0, -10) : p;
const cfUrl = (p) => p.startsWith('data/') ? `${DATA}/${p.slice(5)}` : `${APP}/${urlPath(p)}`;

async function get(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      return { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      if (attempt === 3) return { status: 0, error: String(e) };
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
}

async function pool(items, n, fn) {
  let i = 0, done = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
      if (++done % 1000 === 0) console.error(`  ${done}/${items.length}`);
    }
  });
  await Promise.all(workers);
}

// A build's hashes vary with its environment, not just its source: a clean
// build of the live commit (61cd5630af) renames 5 bundles and changes the
// Svelte scoped-class hashes and island ids on 213 pages. Mask all three.
const maskAstro = (s) => s
  .replace(/\/_astro\/[A-Za-z0-9_.@-]+?\.[A-Za-z0-9_-]{8}\.(js|css)/g, '/_astro/*.$1')
  .replace(/svelte-[a-z0-9]{4,8}\b/g, 'svelte-*')
  .replace(/ uid="[A-Za-z0-9_-]+"/g, ' uid="*"');
const stem = (p) => p.replace(/\.[A-Za-z0-9_-]{8}\.(js|css)$/, '.$1');

const result = { ref: REF, app: APP, data: DATA, files: files.length, same: 0,
  missing: [], errors: [], differ: { 'html-hash-only': [], astro: [], sw: [], other: [] }, live: {} };
const servedAstro = new Set();

console.error(`Comparing ${files.length} files at ${CONCURRENCY} in flight`);
await pool(files, CONCURRENCY, async (f) => {
  const r = await get(cfUrl(f.path));
  if (r.status === 0) return result.errors.push({ path: f.path, error: r.error });
  if (r.status === 404) return result.missing.push(f.path);
  if (r.status !== 200) return result.errors.push({ path: f.path, status: r.status });
  if (blobSha(r.body) === f.sha) return void result.same++;
  if (f.path === 'sw.js') return result.differ.sw.push(f.path);
  if (f.path.endsWith('.html')) {
    const live = git('cat-file', 'blob', f.sha).toString();
    return result.differ[maskAstro(live) === maskAstro(r.body.toString()) ? 'html-hash-only' : 'other'].push(f.path);
  }
  result.differ.other.push(f.path);
});

// A bundle missing under its old name is expected when its hash changed; it
// is "astro" only if a bundle with the same stem exists in the new build.
const newAstro = execFileSync('find', ['app/dist/_astro', '-type', 'f']).toString().trim().split('\n')
  .map(p => p.replace(/^app\/dist\//, ''));
for (const p of newAstro) servedAstro.add(stem(p));
result.missing = result.missing.filter(p => {
  if (p.startsWith('_astro/') && servedAstro.has(stem(p))) { result.differ.astro.push(p); return false; }
  return true;
});

// Live sample: confirm the gh-pages tree is what live serves.
const sample = [...files].sort(() => Math.random() - 0.5).slice(0, LIVE_SAMPLE);
const liveBad = [];
await pool(sample, Math.min(CONCURRENCY, 2), async (f) => {
  const r = await get(`${LIVE}/${urlPath(f.path)}`);
  if (r.status !== 200 || blobSha(r.body) !== f.sha) liveBad.push({ path: f.path, status: r.status });
});
result.live = { sampled: sample.length, mismatched: liveBad };

const counts = Object.fromEntries(Object.entries(result.differ).map(([k, v]) => [k, v.length]));
console.log(JSON.stringify({ files: result.files, same: result.same, missing: result.missing.length,
  errors: result.errors.length, differ: counts, live: { sampled: sample.length, mismatched: liveBad.length } }, null, 2));
if (args.out) writeFileSync(args.out, JSON.stringify(result, null, 2));
const bad = result.missing.length + result.errors.length + result.differ.other.length + liveBad.length;
if (bad) {
  for (const p of result.missing.slice(0, 20)) console.log(`missing ${p}`);
  for (const e of result.errors.slice(0, 20)) console.log(`error ${JSON.stringify(e)}`);
  for (const p of result.differ.other.slice(0, 20)) console.log(`differs ${p}`);
  for (const e of liveBad.slice(0, 20)) console.log(`live ${JSON.stringify(e)}`);
}
process.exit(bad ? 1 : 0);
