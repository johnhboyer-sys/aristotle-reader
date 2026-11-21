#!/usr/bin/env node
// Deploy a Cloudflare build: the corpus data to R2, then the app to the
// Worker `aristotle-reader` (docs/cloudflare.md). Node 22+, no dependencies
// beyond `npx wrangler@4`, which must be logged in to John's account.
//
//   cd app && PUBLIC_SHOW_PRIVATE=0 PUBLIC_DATA_ROOT=https://aristotle-data.johnhboyer.com npm run build
//   npm run deploy:cloudflare        — gates, upload changed data, deploy the app
//   npm run deploy:cloudflare:dry    — gates and the upload plan; nothing is sent
//
// Flags: --dry-run  --data-root=<url>  --site=<url>
//        --min-pages-ratio=<0..1>  --skip-link-check  --help
//
// It never deletes from R2. A file in the bucket that the build lacks stays
// there, as `npm run deploy` restored live-only data files on gh-pages, and
// like them it is fetched and run through the data gates. R2 cannot be listed
// with wrangler, so the bucket carries a record of every key this script has
// uploaded (KEY_RECORD); the record is how such files are found.
// The pure functions are exported for scripts/__tests__/deploy-cloudflare.test.mjs.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  auditDistScale, readAll, scanForLeaks, scanGatedSlots, scanHeldWorks,
  scanSearchShards, scanTranslationIndexes, walk,
} from './deploy-gh-pages.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const ACCOUNT_ID = '6ff75c6d6c06d1092df2c7efd42077ba';
export const BUCKET = 'aristotle-reader-data';
export const DATA_ROOT = 'https://aristotle-data.johnhboyer.com';
export const SITE = 'https://aristotle.johnhboyer.com';
export const CACHE_CONTROL = 'max-age=600';   // what GitHub Pages sent
export const KEY_RECORD = '_deploy/keys.json';
export const CONTENT_TYPES = {
  json: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  bin: 'application/octet-stream',
};
const HEAD_CONCURRENCY = 4;

export function parseArgs(argv) {
  const options = {
    dryRun: false, dataRoot: DATA_ROOT, site: SITE,
    minPagesRatio: 0.9, skipLinkCheck: false, help: false,
  };
  for (const arg of argv) {
    const [flag, value] = arg.split(/=(.*)/s);
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--skip-link-check') options.skipLinkCheck = true;
    else if (flag === '--help') options.help = true;
    else if (flag === '--data-root' && value) options.dataRoot = value.replace(/\/+$/, '');
    else if (flag === '--site' && value) options.site = value.replace(/\/+$/, '');
    else if (flag === '--min-pages-ratio' && value !== undefined && !Number.isNaN(Number(value))) options.minPagesRatio = Number(value);
    else throw new Error(`unknown or incomplete flag: ${arg}`);
  }
  return options;
}

// The root the build wrote into dist/sw.js (app/scripts/postbuild-data-root.mjs),
// or '' for a GitHub Pages build.
export function builtDataRoot(swSource) {
  const m = swSource.match(/^const DATA_ROOT = (".*"|'');$/m);
  if (!m) return null;
  return m[1] === "''" ? '' : JSON.parse(m[1]).replace(/\/+$/, '');
}

// The gates on the data a host will serve, as [name, report] pairs.
// `served(filter)` yields { path, text } for each file whose name passes.
// scripts/make-bundle.mjs runs the same list on a mirror's bundle.
export function dataGates(served) {
  const json = () => served((n) => n.toLowerCase().endsWith('.json'));
  const gated = new Set(readdirSync(path.join(ROOT, 'manifests'))
    .filter((n) => n.endsWith('-public.yaml')).map((n) => n.slice(0, -'-public.yaml'.length)));
  return [
    ['leak check', scanForLeaks(json())],
    ['gated translation slots', scanGatedSlots(json(), { gated })],
    ['held works', scanHeldWorks(served(() => true))],
    ['search indexes', scanTranslationIndexes(json())],
    ['search shards', scanSearchShards(json())],
  ];
}

export function contentTypeFor(key) {
  return CONTENT_TYPES[key.slice(key.lastIndexOf('.') + 1).toLowerCase()] ?? null;
}

export function countSitemapPages(xml) {
  return (xml.match(/<loc>/g) ?? []).length;
}

// What to upload: every local file whose R2 object is missing, or whose ETag
// is not its MD5 (a multipart ETag carries a "-" and never matches), or whose
// Content-Type or Cache-Control is not what this script sets.
export function planUploads(local, remote) {
  return local.filter(({ key, md5 }) => {
    const r = remote.get(key);
    return !r || r.etag !== md5 || r.type !== contentTypeFor(key) || r.cacheControl !== CACHE_CONTROL;
  });
}

// Keys in the bucket's record that the build does not have.
export function remoteOnlyKeys(recorded, localKeys) {
  const local = new Set(localKeys);
  return recorded.filter((k) => !local.has(k));
}

export function groupByContentType(files) {
  const groups = new Map();
  for (const f of files) {
    const type = contentTypeFor(f.key);
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(f);
  }
  return groups;
}

// ---------------------------------------------------------------------------

class Refusal extends Error {}
const fail = (message) => { throw new Refusal(message); };
const heading = (text) => console.log(`\n== ${text}`);

function run(command, args, { cwd = ROOT, capture = false, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd, env: { ...process.env, ...env }, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${command} ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with status ${result.status}${capture ? `\n${result.stderr}` : ''}`);
  return capture ? result.stdout : '';
}

// The data hostname is a Cloudflare custom domain, whose cache holds R2
// responses for max-age. A query string the cache has not seen goes through
// to R2 (which ignores it), so the headers are R2's own, not a cached copy.
export function headUrl(dataRoot, key, nonce) {
  return `${dataRoot}/${key}?readback=${nonce}`;
}

async function headObjects(keys, dataRoot) {
  const objects = new Map();
  const nonce = Date.now().toString(36);
  let i = 0, done = 0;
  const worker = async () => {
    while (i < keys.length) {
      const key = keys[i++];
      for (let attempt = 1; ; attempt++) {
        try {
          const r = await fetch(headUrl(dataRoot, key, nonce), { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
          if (r.status === 200) {
            objects.set(key, {
              etag: (r.headers.get('etag') ?? '').replace(/^W\//, '').replace(/"/g, ''),
              type: r.headers.get('content-type'),
              cacheControl: r.headers.get('cache-control'),
            });
          }
          else if (r.status !== 404) throw new Error(`HTTP ${r.status}`);
          break;
        } catch (error) {
          if (attempt === 5) fail(`HEAD ${dataRoot}/${key}: ${error.message}${error.cause ? ` (${error.cause.code ?? error.cause.message})` : ''}`);
          await new Promise((res) => setTimeout(res, 1000 * 2 ** (attempt - 1)));
        }
      }
      if (++done % 2000 === 0) console.log(`  ${done}/${keys.length}`);
    }
  };
  await Promise.all(Array.from({ length: HEAD_CONCURRENCY }, worker));
  return objects;
}

// `allow404`: answer null for a missing object instead of refusing.
async function getText(url, { allow404 = false } = {}) {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (allow404 && r.status === 404) return null;
  if (!r.ok) fail(`GET ${url} answered ${r.status}`);
  return r.text();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n'));
    return;
  }
  // Always app/dist: app/wrangler.jsonc deploys that folder and no other.
  const dist = path.join(ROOT, 'app', 'dist');
  const { dataRoot } = options;
  const wranglerEnv = { CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };

  heading('The build');
  if (!existsSync(path.join(dist, 'index.html'))) fail(`${dist} has no index.html; build first`);
  const swRoot = builtDataRoot(readFileSync(path.join(dist, 'sw.js'), 'utf8'));
  if (swRoot === null) fail('dist/sw.js has no DATA_ROOT line; app/public/sw.js has drifted');
  if (swRoot !== dataRoot) {
    fail(swRoot === ''
      ? 'this is a GitHub Pages build (no PUBLIC_DATA_ROOT). Rebuild with PUBLIC_DATA_ROOT set.'
      : `the build reads data from ${swRoot}, not ${dataRoot}. Rebuild, or pass --data-root=${swRoot}.`);
  }
  const ignore = existsSync(path.join(dist, '.assetsignore')) ? readFileSync(path.join(dist, '.assetsignore'), 'utf8') : '';
  if (!/^data\/?$/m.test(ignore)) fail('dist/.assetsignore does not exclude data/; the data would go into the Worker');
  const dataDir = path.join(dist, 'data');
  if (!existsSync(dataDir)) fail(`${dataDir} is missing; the build should copy the corpus there`);
  if (existsSync(path.join(dist, 'bonitz'))) fail(`${path.join(dist, 'bonitz')} exists. /bonitz/ must stay a 404; the page was removed from app/ on 2026-09-03.`);
  const bonitzAssets = readdirSync(path.join(dist, '_astro')).filter((n) => n.startsWith('bonitz.'));
  if (bonitzAssets.length) fail(`dist/_astro carries ${bonitzAssets.join(', ')}, a build that emitted the bonitz page. Rebuild.`);
  if (run('git', ['status', '--porcelain', '--', 'sources/lemma-slugs.json'], { capture: true }).trim()) {
    fail('sources/lemma-slugs.json has uncommitted changes. Commit the record first; its slugs are live addresses.');
  }
  const source = run('git', ['rev-parse', '--short=10', 'HEAD'], { capture: true }).trim();
  const dirty = run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true }).trim();
  console.log(`  source ${source}${dirty ? ' (WORKING TREE HAS UNCOMMITTED CHANGES)' : ''}; data root ${dataRoot}`);

  heading(`Scale: the build against ${options.site}`);
  // The build's pages as files (a stale sitemap must not stand in for them);
  // live's from its sitemap, which must list some.
  let distPages = 0;
  for (const _ of walk(dist, (n) => n === 'index.html', dist)) distPages++;
  const livePages = countSitemapPages(await getText(`${options.site}/sitemap-0.xml`));
  if (!livePages) fail(`${options.site}/sitemap-0.xml lists no pages; the scale check would examine nothing`);
  console.log(`  pages: ${distPages} index.html files in the build, ${livePages} in the live sitemap`);
  const scale = auditDistScale(distPages, livePages, options.minPagesRatio);
  if (!scale.ok) fail(scale.reason);

  if (!options.skipLinkCheck) {
    heading('Link integrity (must be 0 broken)');
    try { run('node', [path.join(ROOT, 'scripts', 'check-links.mjs'), dist]); }
    catch (error) { fail(`link check did not pass: ${error.message}`); }
  }

  heading(`Data: the build against ${BUCKET}`);
  const local = [...walk(dataDir, () => true, dataDir)].map(({ path: key, file }) => ({
    key, file, md5: createHash('md5').update(readFileSync(file)).digest('hex'),
  }));
  const unknown = local.filter((f) => !contentTypeFor(f.key));
  if (unknown.length) fail(`no content type for ${unknown.slice(0, 5).map((f) => f.key).join(', ')}; add the extension to CONTENT_TYPES`);
  const recorded = JSON.parse(await getText(`${dataRoot}/${KEY_RECORD}`));
  const remoteOnly = remoteOnlyKeys(recorded, local.map((f) => f.key));
  console.log(`  bucket record: ${recorded.length} keys; in the bucket but not the build: ${remoteOnly.length}`);
  for (const key of remoteOnly.slice(0, 20)) console.log(`    kept: ${key}`);
  // The record is written before an upload, so it can name a key whose
  // upload then failed; such a key is not in R2 and has nothing to gate.
  const kept = [];
  for (const key of remoteOnly) {
    const text = await getText(`${dataRoot}/${key}`, { allow404: true });
    if (text !== null) kept.push({ path: `data/${key}`, text });
    else console.log(`    recorded but not in the bucket: ${key}`);
  }

  heading('Data gates (as npm run deploy)');
  // What R2 will serve: the build's files plus the ones kept from before.
  // A generator, as in npm run deploy: the corpus is streamed, never held whole.
  const served = function* (filter) {
    yield* readAll(walk(dataDir, filter, dist));
    for (const f of kept) if (filter(path.posix.basename(f.path))) yield f;
  };
  for (const [name, report] of dataGates(served)) {
    console.log(`  ${name}: ${report.ok ? 'ok' : 'FAILED'}`);
    if (!report.ok) {
      for (const problem of report.problems.slice(0, 10)) console.log(`  !! ${problem}`);
      fail(`${name} did not pass`);
    }
  }

  console.log(`\n  ${local.length} data files; reading their R2 headers, ${HEAD_CONCURRENCY} at a time`);
  const remote = await headObjects(local.map((f) => f.key), dataRoot);
  const uploads = planUploads(local, remote);
  console.log(`  to upload: ${uploads.length} (${uploads.filter((f) => !remote.has(f.key)).length} new, ${uploads.filter((f) => remote.has(f.key)).length} changed)`);
  for (const f of uploads.slice(0, 20)) console.log(`    ${f.key}`);
  if (uploads.length > 20) console.log(`    … and ${uploads.length - 20} more`);

  if (options.dryRun) {
    heading('Dry run: nothing uploaded, nothing deployed');
    return;
  }

  // The record is written before the upload, so a key that reaches R2 is on
  // record even if the upload stops partway.
  const record = [...new Set([...recorded, ...local.map((f) => f.key)])].sort();
  if (record.length !== recorded.length) {
    const tmp = mkdtempSync(path.join(tmpdir(), 'aristotle-r2-'));
    try {
      const file = path.join(tmp, 'keys.json');
      writeFileSync(file, JSON.stringify(record));
      run('npx', ['-y', 'wrangler@4', 'r2', 'object', 'put', `${BUCKET}/${KEY_RECORD}`, '--remote', '--file', file,
        '--ct', CONTENT_TYPES.json, '--cc', 'no-cache'], { env: wranglerEnv });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    console.log(`  bucket record: ${record.length} keys`);
  }

  if (uploads.length) {
    heading('Uploading data to R2');
    const tmp = mkdtempSync(path.join(tmpdir(), 'aristotle-r2-'));
    try {
      for (const [n, [type, files]] of [...groupByContentType(uploads)].entries()) {
        const list = path.join(tmp, `list-${n}.json`);
        writeFileSync(list, JSON.stringify(files.map(({ key, file }) => ({ key, file }))));
        run('npx', ['-y', 'wrangler@4', 'r2', 'bulk', 'put', BUCKET, '--remote', '--filename', list,
          '--ct', type, '--cc', CACHE_CONTROL, '--concurrency', '8', '--force'], { env: wranglerEnv });
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
    const after = await headObjects(uploads.map((f) => f.key), dataRoot);
    const still = planUploads(uploads, after);
    if (still.length) fail(`${still.length} file(s) did not reach R2, e.g. ${still[0].key}; rerun to retry`);
    console.log(`  ${uploads.length} file(s) uploaded and read back`);
  }
  heading('Deploying the app to the Worker');
  run('npx', ['-y', 'wrangler@4', 'deploy'], { cwd: path.join(ROOT, 'app'), env: wranglerEnv });
  console.log(`\n  Deployed ${source}. Check ${options.site}/ and a book page; data comes from ${dataRoot}.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (error instanceof Refusal) console.error(`\nDEPLOY REFUSED: ${error.message}`);
    else console.error(`\nDeploy failed: ${error.stack || error}`);
    process.exit(1);
  });
}
