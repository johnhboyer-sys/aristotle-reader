#!/usr/bin/env node
// Dependency-free link checker for the emitted Astro site (Node 22+).
import { promises as fs } from 'node:fs';
import path from 'node:path';

const BASE = '/aristotle-reader';
const MAX_ID_CACHE = 6000;
const MAX_REPORTS = 200;

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node scripts/check-links.mjs [DIST_DIR | --dist=DIST_DIR]');
  process.exit(2);
}

function getDist() {
  const args = process.argv.slice(2);
  let dist;
  for (const arg of args) {
    if (arg.startsWith('--dist=')) {
      if (dist) usage('Specify the dist directory only once.');
      dist = arg.slice(7);
    } else if (arg.startsWith('-')) {
      usage(`Unknown option: ${arg}`);
    } else if (!dist) {
      dist = arg;
    } else {
      usage('Specify the dist directory only once.');
    }
  }
  return path.resolve(dist || path.resolve(import.meta.dirname, '..', 'app', 'dist'));
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : parseInt(n, 10)));
}

function decodePath(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function splitReference(reference) {
  const hash = reference.indexOf('#');
  const beforeHash = hash < 0 ? reference : reference.slice(0, hash);
  const fragment = hash < 0 ? null : decodePath(reference.slice(hash + 1));
  const question = beforeHash.indexOf('?');
  return {
    pathname: question < 0 ? beforeHash : beforeHash.slice(0, question),
    query: question < 0 ? '' : beforeHash.slice(question + 1),
    fragment,
  };
}

function isExternal(reference) {
  return /^(?:https?:|mailto:|tel:|\/\/)/i.test(reference);
}

async function existsFile(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}

async function* htmlFiles(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(child);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) yield child;
  }
}

function virtualDirectory(dist, source) {
  const relative = path.relative(dist, source);
  return path.dirname(relative) === '.' ? '' : path.dirname(relative);
}

async function main() {
  const dist = getDist();
  let stat;
  try { stat = await fs.stat(dist); } catch { usage(`Dist directory does not exist: ${dist}`); }
  if (!stat.isDirectory()) usage(`Dist path is not a directory: ${dist}`);

  let pages = 0;
  let links = 0;
  let anchors = 0;
  const broken = [];
  const idCache = new Map();
  const report = (source, href, reason) => broken.push({ source: path.relative(dist, source), href, reason });

  async function idsFor(file) {
    if (idCache.has(file)) {
      const ids = idCache.get(file);
      idCache.delete(file);
      idCache.set(file, ids);
      return ids;
    }
    let html;
    try { html = await fs.readFile(file, 'utf8'); } catch { return null; }
    const ids = new Set();
    for (const match of html.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      ids.add(decodeEntities(match[1] ?? match[2] ?? match[3]));
    }
    idCache.set(file, ids);
    if (idCache.size > MAX_ID_CACHE) idCache.delete(idCache.keys().next().value);
    return ids;
  }

  async function resolve(source, pathname) {
    let relative;
    if (!pathname) return source;
    if (pathname.startsWith('/')) {
      let rooted = decodePath(pathname);
      if (rooted === BASE || rooted === `${BASE}/`) rooted = '/';
      else if (rooted.startsWith(`${BASE}/`)) rooted = rooted.slice(BASE.length);
      relative = rooted.replace(/^\/+/, '');
    } else {
      relative = path.join(virtualDirectory(dist, source), decodePath(pathname));
    }
    relative = path.normalize(relative);
    if (relative === '.') relative = '';
    if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
    const candidate = path.join(dist, relative);
    for (const file of [candidate, path.join(candidate, 'index.html'), `${candidate}.html`]) {
      if (await existsFile(file)) return file;
    }
    return null;
  }

  async function checkReference(source, raw, kind) {
    const href = decodeEntities(raw.trim());
    if (!href || href.startsWith('#')) {
      if (href.startsWith('#') && href.length > 1) {
        anchors++;
        const ids = await idsFor(source);
        if (!ids?.has(decodePath(href.slice(1)))) report(source, raw, 'fragment id not found');
      }
      return;
    }
    if (isExternal(href) || (kind !== 'a' && /^data:/i.test(href))) return;
    links++;
    const parts = splitReference(href);
    const target = await resolve(source, parts.pathname);
    if (!target) {
      report(source, raw, 'target does not exist');
      return;
    }
    if (parts.fragment) {
      anchors++;
      const ids = await idsFor(target);
      if (!ids?.has(parts.fragment)) report(source, raw, 'fragment id not found');
    }
    const loc = parts.query.match(/(?:^|&)loc=([^&]*)/i);
    if (loc) {
      anchors++;
      const value = decodePath(loc[1]);
      const match = value.match(/^([^:]+):(\d+)$/);
      if (match) {
        const ids = await idsFor(target);
        if (!ids?.has(`L${match[1]}-${match[2]}`) && !ids?.has(`L${match[1]}-${match[2]}-c`)) {
          report(source, raw, `Bekker target L${match[1]}-${match[2]} not found`);
        }
      }
    }
  }

  for await (const source of htmlFiles(dist)) {
    pages++;
    let html;
    try { html = await fs.readFile(source, 'utf8'); } catch { report(source, '', 'cannot read HTML'); continue; }
    const tags = html.matchAll(/<(a|img|link|script)\b[^>]*>/gi);
    for (const tagMatch of tags) {
      const kind = tagMatch[1].toLowerCase();
      const attribute = (kind === 'img' || kind === 'script') ? 'src' : 'href';
      const attr = new RegExp("\\b" + attribute + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s\"'=<>`]+))", 'i').exec(tagMatch[0]);
      if (attr) await checkReference(source, attr[1] ?? attr[2] ?? attr[3], kind);
    }
  }

  const indexFile = path.join(dist, 'data', 'lemmata', '_index.json');
  try {
    const entries = JSON.parse(await fs.readFile(indexFile, 'utf8'));
    const indexed = new Set((Array.isArray(entries) ? entries : []).map(entry => typeof entry === 'string' ? entry : entry?.slug).filter(Boolean));
    for (const slug of indexed) {
      const file = path.join(dist, 'lemma', slug, 'index.html');
      if (!await existsFile(file)) report(indexFile, slug, 'lemma index entry has no page');
    }
    try {
      for (const entry of await fs.readdir(path.join(dist, 'lemma'), { withFileTypes: true })) {
        if (entry.isDirectory() && !indexed.has(entry.name)) report(path.join(dist, 'lemma'), entry.name, 'lemma page missing from index');
      }
    } catch { /* A missing lemma directory is covered by indexed entries, if any. */ }
  } catch (error) {
    if (error?.code === 'ENOENT') console.log('Note: data/lemmata/_index.json is absent; skipping lemma cross-check.');
    else report(indexFile, '', 'cannot read lemma index');
  }

  console.log(`Pages crawled: ${pages}; links checked: ${links}; anchors checked: ${anchors}; broken: ${broken.length}`);
  for (const failure of broken.slice(0, MAX_REPORTS)) console.log(`${failure.source} -> ${failure.href} (${failure.reason})`);
  if (broken.length > MAX_REPORTS) console.log(`+${broken.length - MAX_REPORTS} more`);
  process.exitCode = broken.length ? 1 : 0;
}

main().catch(error => {
  console.error(`Link checker failed: ${error.stack || error}`);
  process.exit(2);
});
