#!/usr/bin/env node
// List the data files a reader probably serves, for a site that keeps no key
// record (the plays, whose data ships inside the Worker). The list feeds
// scripts/snapshot-live.mjs --paths-file, where a wrong guess is a listed 404.
// HANDOFF-PORTABILITY.md, phase 0. Node 22+, no dependencies.
//
// The readers share one data layout, so the names come from three places:
//   the site's own indexes (the sitemap's path segments that have a
//     manifest.json, each manifest's books, editions and translations,
//     lemmata/_index.json, search-shards/index.json);
//   the key records of the readers that have one (--records), with the work
//     and the numbers taken out;
//   file names the site's own code mentions (--names-file).
//
//   node scripts/snapshot-candidates.mjs --site=https://greekdrama.johnhboyer.com \
//     --records=a/keys.json,b/keys.json [--names-file=names.txt] --out=list.txt
//
// It is a guess, so it is measured: --recall=<snapshot folder> builds the list
// for a reader whose key record is known, from that snapshot's own indexes and
// the OTHER readers' records, and prints what share of the real keys it named,
// family by family. Run it for each known reader before trusting the list.
//
//   node scripts/snapshot-candidates.mjs --recall=<snapshot>/aristotle --records=<plato keys>,<homer keys>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALPHABET = [...'abcdefghijklmnopqrstuvwxyz_'];
const pad = (n, width) => String(n).padStart(width, '0');

// A record's works are the top folders that hold a manifest.json.
export function worksIn(keys) {
  return new Set(keys.filter(k => /^[^/]+\/manifest\.json$/.test(k)).map(k => k.split('/')[0]));
}

// Per-work names with the numbers taken out ("book-{2}.json"), root names,
// and the names in each shared folder.
export function templates(records) {
  const t = { perWork: new Set(), root: new Set(), dirs: new Map() };
  for (const keys of records) {
    const works = worksIn(keys);
    for (const key of keys) {
      const parts = key.split('/');
      if (parts.length === 1) t.root.add(key);
      else if (works.has(parts[0])) t.perWork.add(parts.slice(1).join('/').replace(/\d+/g, d => `{${d.length}}`));
      else {
        const dir = parts.slice(0, -1).join('/');
        if (!t.dirs.has(dir)) t.dirs.set(dir, new Set());
        t.dirs.get(dir).add(parts.at(-1));
      }
    }
  }
  return t;
}

// A folder sharded by letter gets the whole alphabet; one sharded by letter
// and length ("a-2.json") gets every letter at 2 to 6.
export function expandShards(names) {
  const out = new Set(names);
  if ([...names].some(n => /^[a-z_]\.json$/.test(n))) for (const c of ALPHABET) out.add(`${c}.json`);
  if ([...names].some(n => /^[a-z_]-\d\.json$/.test(n))) for (const c of ALPHABET) for (let n = 2; n <= 6; n++) out.add(`${c}-${n}.json`);
  return out;
}

// works: [{ id, books, editionPaths: ['ed/x/'], translations: ['jowett'] }]
export function candidates({ works, t, names = [], lemmaSlugs = [], shardStreams = {} }) {
  const out = new Set();
  const flat = names.filter(n => !n.includes('/'));
  for (const n of [...t.root, ...flat]) out.add(n);
  for (const w of works) {
    const books = Math.max(1, w.books ?? 1);
    const perWork = new Set([...t.perWork, ...flat, ...flat.map(n => `search/${n}`)]);
    for (const id of w.translations ?? []) {
      for (const n of [`search/english-overlay-${id}.json`, `search/english-${id}.json`, `align-${id}.json`]) perWork.add(n);
    }
    for (const prefix of ['', ...(w.editionPaths ?? [])]) {
      for (const name of perWork) {
        if (!name.includes('{')) { out.add(`${w.id}/${prefix}${name}`); continue; }
        for (let n = 1; n <= books; n++) out.add(`${w.id}/${prefix}${name.replace(/\{(\d)\}/g, (_, width) => pad(n, Number(width)))}`);
      }
    }
    for (const ext of ['json', 'md']) out.add(`reports/quality_${w.id}.${ext}`);
  }
  for (const [dir, dirNames] of t.dirs) {
    if (dir === 'lemmata') continue;              // read from the site's own index below
    for (const n of expandShards(dirNames)) out.add(`${dir}/${n}`);
  }
  for (const n of ['_index.json', '_words.json']) out.add(`lemmata/${n}`);
  for (const slug of lemmaSlugs) out.add(`lemmata/${slug}.json`);
  for (const n of ['index.json', 'summary.json', 'vocab.json']) out.add(`search-shards/${n}`);
  for (const [stream, shards] of Object.entries(shardStreams)) for (const s of shards) out.add(`search-shards/${stream}/${s}.json`);
  return [...out].sort();
}

// What share of the real keys the list named, by top folder ("<work>" for a work's own).
export function recall(list, keys) {
  const named = new Set(list);
  const works = worksIn(keys);
  const families = {};
  for (const key of keys) {
    const top = key.includes('/') ? (works.has(key.split('/')[0]) ? '<work>' : key.split('/')[0]) : '(root)';
    families[top] ??= { keys: 0, named: 0, missed: [] };
    families[top].keys++;
    if (named.has(key)) families[top].named++;
    else if (families[top].missed.length < 12) families[top].missed.push(key);
  }
  const total = keys.length, hit = keys.filter(k => named.has(k)).length;
  return { keys: total, named: hit, share: total ? hit / total : 0, listed: list.length, families };
}

// Does a record the list was built from hold any of the target's own works?
// Then the list copies its answers and the share means nothing. The readers
// share family names (lemma-map/a.json) and no work, so one shared work is
// enough to refuse, and padding the record does not get round it.
export function gradesItself(records, keys) {
  const own = worksIn(keys);
  return records.some(r => [...worksIn(r)].some(w => own.has(w)));
}

// What the site itself says: read(key) returns the file's text or null.
export async function siteIndexes(read, segments) {
  const works = [];
  for (const id of [...new Set(segments)].sort()) {
    const text = await read(`${id}/manifest.json`);
    if (!text) continue;
    const m = JSON.parse(text);
    const books = m.citation?.books?.length ?? m.presentation?.books ?? m.books?.length ?? (Number.isInteger(m.books) ? m.books : 1);
    works.push({
      id, books,
      editionPaths: (m.greekEditions ?? []).map(e => e.path).filter(Boolean),
      translations: (m.translations ?? []).map(x => x.id).filter(Boolean),
    });
  }
  const index = await read('lemmata/_index.json');
  const lemmaSlugs = index ? JSON.parse(index).map(e => (typeof e === 'string' ? e : e.slug)).filter(Boolean) : [];
  const shards = await read('search-shards/index.json');
  const shardStreams = {};
  if (shards) for (const [stream, v] of Object.entries(JSON.parse(shards).streams ?? {})) shardStreams[stream] = v.shards ?? [];
  return { works, lemmaSlugs, shardStreams };
}

const segmentsOf = (xmls) => xmls.flatMap(x => [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)])
  .flatMap(m => new URL(m[1]).pathname.split('/').filter(Boolean).map(decodeURIComponent));
const sitemapsIn = (indexXml) => [...indexXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => new URL(m[1]).pathname);

async function main(argv) {
  const args = Object.fromEntries(argv.map((a) => {
    const m = a.match(/^--([^=]+)=(.+)$/s);
    if (!m) throw new Error(`bad argument ${a}`);
    return [m[1], m[2]];
  }));
  const records = (args.records ?? '').split(',').filter(Boolean).map(f => JSON.parse(readFileSync(f, 'utf8')));
  if (!records.length) throw new Error('--records is required');
  const names = args['names-file'] ? readFileSync(args['names-file'], 'utf8').split('\n').map(l => l.trim()).filter(Boolean) : [];
  const t = templates(records);

  if (args.recall) {
    const folder = args.recall;
    const read = async (key) => {
      const p = path.join(folder, 'data', key);
      return existsSync(p) ? readFileSync(p, 'utf8') : null;
    };
    const app = (p) => readFileSync(path.join(folder, 'app', p), 'utf8');
    const segments = segmentsOf(sitemapsIn(app('sitemap-index.xml')).map(p => app(p.slice(1))));
    const list = candidates({ ...(await siteIndexes(read, segments)), t, names });
    const keys = JSON.parse(readFileSync(path.join(folder, 'data/_deploy/keys.json'), 'utf8'));
    if (gradesItself(records, keys)) throw new Error("--records includes the target's own key record: the measure would grade itself");
    const r = recall(list, keys);
    console.log(`${folder}: named ${r.named} of ${r.keys} real keys (${(100 * r.share).toFixed(2)}%) with a list of ${r.listed}`);
    for (const [family, f] of Object.entries(r.families).sort()) {
      console.log(`  ${family}: ${f.named}/${f.keys}${f.missed.length ? `  missed e.g. ${f.missed.join(' ')}` : ''}`);
    }
    return r.keys === 0 ? 1 : 0;
  }

  const site = args.site?.replace(/\/+$/, '');
  if (!site || !args.out) throw new Error('--site and --out are required (or --recall)');
  const get = async (url) => {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    return r.status === 200 && !(r.headers.get('content-type') ?? '').startsWith('text/html') ? r.text() : null;
  };
  const xml = async (p) => {
    const r = await fetch(site + p, { signal: AbortSignal.timeout(60_000) });
    if (r.status !== 200) throw new Error(`${site + p}: ${r.status}`);
    return r.text();
  };
  const sitemaps = [];
  for (const p of sitemapsIn(await xml('/sitemap-index.xml'))) sitemaps.push(await xml(p));
  const indexes = await siteIndexes(key => get(`${site}/data/${key}`), segmentsOf(sitemaps));
  if (!indexes.works.length) throw new Error('found no work with a manifest.json: nothing to list');
  const list = candidates({ ...indexes, t, names });
  writeFileSync(args.out, list.map(k => `data/${k}\n`).join(''));
  console.log(`${site}: ${indexes.works.length} works, ${indexes.lemmaSlugs.length} lemma pages, `
    + `${Object.values(indexes.shardStreams).reduce((n, s) => n + s.length, 0)} search shards; ${list.length} candidates written to ${args.out}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
