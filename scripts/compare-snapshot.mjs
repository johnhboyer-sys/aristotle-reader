#!/usr/bin/env node
// Does a build make what the live site served? HANDOFF-PORTABILITY.md, test 2.
// Node 22+, no dependencies.
//
//   node scripts/compare-snapshot.mjs --sums=<snapshot>/SHA256SUMS --prefix=data/ \
//     --build=app/dist/data [--live-only=<list>]
//   node scripts/compare-snapshot.mjs --sums=<snapshot>/SHA256SUMS --prefix=app/ \
//     --build=app/dist --pages=<snapshot> --svelte=shared/components \
//     --skip=data/,.assetsignore,_redirects
//
// The snapshot's SHA256SUMS (scripts/snapshot-live.mjs wrote it, and
// scripts/verify-snapshot.mjs proves a copy still matches it) stands in for
// the snapshot: only the list is read, so the check runs where the 889 MB of
// files are not. Every file under --build is hashed and compared with the
// list's entry at <prefix><path>.
//
// Exit 1 when a file differs, when the build holds a file the snapshot does
// not, when the snapshot holds a file the build did not make and --live-only
// does not name it, when --live-only names a file that is not live-only (a
// list gone stale), when the build holds a link in place of a file, and when
// nothing was compared. --live-only is a text file, one path per line, "#"
// for comments: the files a live bucket holds that no build makes (its key
// record, objects never deleted). The list is a person's claim, and a
// reviewer reads it: the script cannot tell a file no build makes from one
// this build lost. It checks only that each entry is in the snapshot and not
// in the build.
//
// Pages (--pages=<snapshot folder>). Astro's output is not byte-stable
// across checkouts. Svelte names a component's scoped class by hashing the
// component's path, and a component outside the app's root keeps its whole
// path (see svelteClass), so a build in another folder has other class
// names; the bundles that hold them get other file names, and the islands
// that render them other ids. With --pages, the pages that differ and the
// bundles only one side holds are read from both sides, as bytes, and a file
// passes when the snapshot's copy with these names swapped, and nothing else
// changed, is the build's copy byte for byte:
//   - a Svelte class, only for the class this script computes for a component
//     under --svelte=<folder>[,<folder>] in this checkout, and only where one
//     other name stood, the same one everywhere;
//   - a bundle's file name, only for two bundles, one on each side, alone in
//     sharing a stem (search.<hash>.css), whose contents pass the same test;
//   - an <astro-island>'s uid.
// The swaps must be one to one among the files read (a file that is byte for
// byte the snapshot's is not read), and each is printed. Nothing is masked by
// shape: a page whose words differ fails, and so does a word that merely
// looks like a class. What this cannot see: a word that was the snapshot's
// class name, or any one name, and is now exactly the class of a component
// under --svelte (the old folder is not known, so only the new name is
// computed); a renamed bundle's exact file name in a page's words; a tag
// written out as text, <astro-island uid="…">, whose id changed.
// --skip names build paths or folders that are not part of the comparison
// (the Worker's own files; data/, which is compared on its own); an item that
// matches no build file is an error.
//
// This proves a change to the BUILD left its output alone. It is run against
// the commit the snapshot was taken at; after the corpus changes, a
// difference is the change and not a fault.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSums } from './verify-snapshot.mjs';

// Files under dir, and the links among them: a link's bytes are somewhere
// else, so a build that holds one does not hold that file.
function walk(dir, base = dir, out = { files: [], links: [] }) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) out.links.push(rel);
    else if (entry.isDirectory()) walk(full, base, out);
    else out.files.push(rel);
  }
  return out;
}

const BUNDLE = /\.[A-Za-z0-9_-]{8}\.(js|css)$/;
const stem = (p) => p.replace(BUNDLE, '.$1');
const SVELTE = /(?<![A-Za-z0-9_-])svelte-[a-z0-9]+(?![A-Za-z0-9_-])/g;
const ISLAND = /<astro-island uid="[A-Za-z0-9_-]+"/g;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The class Svelte 5 gives a component whose file is outside the build's
// root: "svelte-" and its hash of the file's absolute path. The hash is
// svelte/src/utils.js `hash`; svelte/src/compiler/state.js keeps a path whole
// when it is not under rootDir; validate-options.js `cssHash` hashes it.
export function svelteClass(file) {
  let h = 5381;
  for (let i = file.length; i--;) h = ((h << 5) - h) ^ file.charCodeAt(i);
  return `svelte-${(h >>> 0).toString(36)}`;
}

// A pattern for one name, whole: an island's tag, a bundle's file name, a class.
const whole = (name) => (name.startsWith('<') ? escape(name)
  : name.startsWith('/') ? `${escape(name)}(?=["'\`)?#\\s]|$)` : `(?<![A-Za-z0-9_-])${escape(name)}(?![A-Za-z0-9_-])`);

// text with each old name replaced by its new one: whole names, in one pass.
export function rename(text, swaps) {
  if (!swaps.size) return text;
  return text.replace(new RegExp([...swaps.keys()].map(whole).join('|'), 'g'), m => swaps.get(m));
}

// Settle what a plain comparison (r) calls different. readBuilt and
// readSnapshot return a file's bytes as a string, one character to a byte;
// ours is the set of Svelte classes computed for this checkout's components.
// Moves the pages that are equal once the names are swapped to
// r.swappedPages and the bundles to r.renamed, lists the swaps in r.swaps,
// and recomputes r.ok.
export function settlePages(r, readBuilt, readSnapshot, ours = new Set()) {
  const isBundle = (p) => p.startsWith('_astro/') && BUNDLE.test(p);
  const group = (list) => Map.groupBy(list.filter(isBundle), stem);
  const olds = group(r.onlySnapshot), news = group(r.onlyBuild);
  const bundles = [...olds].filter(([s, o]) => o.length === 1 && news.get(s)?.length === 1).map(([s, o]) => [o[0], news.get(s)[0]]);
  const pages = r.differ.filter(p => p.endsWith('.html')).map(p => [p, p]);
  const pairs = [...bundles, ...pages].map(([o, n]) => ({ n, was: readSnapshot(o), is: readBuilt(n) }));

  // Every name seen, the unchanged ones too: a class that stays put on one
  // page and changes on another is not a swap.
  const swaps = new Map(), back = new Map();
  const problem = (line) => { if (!r.problems.includes(line)) r.problems.push(line); };
  const add = (o, n) => {
    if ((swaps.get(o) ?? n) !== n || (back.get(n) ?? o) !== o) {
      return problem(`the names are not swapped one to one: ${o} -> ${n}, but ${swaps.has(o) ? `${o} -> ${swaps.get(o)}` : `${back.get(n)} -> ${n}`}`);
    }
    swaps.set(o, n); back.set(n, o);
  };
  for (const [o, n] of bundles) add(`/${path.posix.basename(o)}`, `/${path.posix.basename(n)}`);
  for (const { was, is } of pairs) {
    for (const names of [SVELTE, ISLAND]) {
      const a = was.match(names) ?? [], b = is.match(names) ?? [];
      if (a.length !== b.length) continue;
      a.forEach((o, i) => {
        if (names === SVELTE && o !== b[i] && !ours.has(b[i])) problem(`${o} -> ${b[i]} is not a rename: ${b[i]} is not the class of a component under --svelte`);
        else add(o, b[i]);
      });
    }
  }

  r.swaps = [...swaps].filter(([o, n]) => o !== n);
  for (const [o, n] of r.swaps.filter(([o]) => o.startsWith('/'))) {
    if (pairs.some(({ was }) => new RegExp(whole(n)).test(was))) problem(`the names are not swapped one to one: ${o} -> ${n}, but the snapshot names ${n} too`);
  }
  const changed = new Map(r.swaps);
  const equal = new Set(pairs.filter(({ was, is }) => rename(was, changed) === is).map(({ n }) => n));
  r.swappedPages = pages.map(([p]) => p).filter(p => equal.has(p));
  r.differ = r.differ.filter(p => !r.swappedPages.includes(p));
  r.renamed = [];
  for (const [o, n] of bundles) {
    if (!equal.has(n)) { r.problems.push(`${n} has the stem of ${o} and other contents`); continue; }
    r.renamed.push(n);
    r.onlyBuild.splice(r.onlyBuild.indexOf(n), 1);
    r.onlySnapshot.splice(r.onlySnapshot.indexOf(o), 1);
  }
  r.ok = r.problems.length === 0 && r.differ.length === 0 && r.onlyBuild.length === 0 && r.onlySnapshot.length === 0;
  return r;
}

// snapshot and built: Map of path -> sha256. liveOnly: Set of paths.
export function compare(snapshot, built, liveOnly) {
  const differ = [], onlyBuild = [], onlySnapshot = [], problems = [];
  let same = 0;
  for (const [p, sha] of built) {
    if (!snapshot.has(p)) onlyBuild.push(p);
    else if (snapshot.get(p) === sha) same++;
    else differ.push(p);
  }
  let allowed = 0;
  for (const p of snapshot.keys()) {
    if (built.has(p)) continue;
    if (liveOnly.has(p)) allowed++;
    else onlySnapshot.push(p);
  }
  for (const p of liveOnly) {
    if (built.has(p)) problems.push(`the live-only list names ${p}, which the build makes`);
    else if (!snapshot.has(p)) problems.push(`the live-only list names ${p}, which the snapshot does not hold`);
  }
  if (same + differ.length === 0) problems.push(`examined nothing: no build file has a snapshot entry (${built.size} build files, ${snapshot.size} snapshot entries)`);
  const ok = problems.length === 0 && differ.length === 0 && onlyBuild.length === 0 && onlySnapshot.length === 0;
  return { same, differ, onlyBuild, onlySnapshot, allowed, problems, ok };
}

function main(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--(sums|prefix|build|live-only|pages|svelte|skip)=(.*)$/s);
    if (!m) throw new Error(`unknown argument ${a}`);
    args[m[1]] = m[2];
  }
  if (!args.sums || !args.build) throw new Error('usage: compare-snapshot.mjs --sums=<SHA256SUMS> --build=<folder> [--prefix=data/] [--live-only=<list>] [--pages=<snapshot folder> --svelte=<folder>,<folder>] [--skip=<path>,<folder>/]');
  const prefix = args.prefix ?? '';
  if (!existsSync(args.build) || !statSync(args.build).isDirectory()) throw new Error(`${args.build} is not a folder`);
  const snapshot = new Map(parseSums(readFileSync(args.sums, 'utf8'))
    .filter(e => e.path.startsWith(prefix)).map(e => [e.path.slice(prefix.length), e.sha256]));
  const skip = args.skip === undefined ? [] : args.skip.split(',');
  const under = (s, p) => (s.endsWith('/') ? p.startsWith(s) : p === s);
  const all = walk(args.build);
  const unused = skip.filter(s => ![...all.files, ...all.links].some(p => under(s, p)));
  if (unused.length) throw new Error(`--skip names ${unused.map(s => JSON.stringify(s)).join(', ')}, which matches nothing under ${args.build}`);
  const skipped = (p) => skip.some(s => under(s, p));
  const files = all.files.filter(p => !skipped(p)), links = all.links.filter(p => !skipped(p));
  const built = new Map(files.map(p => [p, createHash('sha256').update(readFileSync(path.join(args.build, p))).digest('hex')]));
  const liveOnly = new Set(args['live-only']
    ? readFileSync(args['live-only'], 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : []);
  const r = compare(snapshot, built, liveOnly);
  for (const p of links) r.problems.push(`${p} is a link, not a file`);
  if (links.length) r.ok = false;
  let components = 0;
  if (args.pages) {
    const ours = new Set();
    for (const dir of args.svelte ? args.svelte.split(',') : []) {
      const found = existsSync(dir) ? walk(dir).files.filter(f => f.endsWith('.svelte')) : [];
      if (!found.length) throw new Error(`--svelte names ${JSON.stringify(dir)}, which holds no .svelte file`);
      for (const f of found) ours.add(svelteClass(realpathSync(path.join(dir, f))));
      components += found.length;
    }
    // latin1: one character to a byte, so equal strings are equal bytes.
    // The snapshot's copy must be the file the list names, or this compares the build with something else.
    const kept = (p) => {
      const bytes = readFileSync(path.join(args.pages, prefix + p));
      if (createHash('sha256').update(bytes).digest('hex') !== snapshot.get(p)) throw new Error(`${path.join(args.pages, prefix + p)} is not the file ${args.sums} lists`);
      return bytes.toString('latin1');
    };
    settlePages(r, p => readFileSync(path.join(args.build, p), 'latin1'), kept, ours);
  }
  const pagesNote = args.pages ? `; ${r.swappedPages.length} pages and ${r.renamed.length} renamed bundles equal once ${r.swaps.length} names are swapped `
    + `(Svelte classes checked against ${components} component path${components === 1 ? '' : 's'})` : '';
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${args.build}: ${r.same} of ${built.size} build files are byte for byte what the snapshot holds; `
    + `${r.allowed} live-only file${r.allowed === 1 ? '' : 's'} allowed${pagesNote}; ${r.differ.length} differ, ${r.onlyBuild.length} only in the build, ${r.onlySnapshot.length} only in the snapshot`);
  for (const p of r.problems) console.log(`  ${p}`);
  for (const [o, n] of r.swaps ?? []) console.log(`  swapped: ${o} -> ${n}`);
  for (const [label, list] of [['differs', r.differ], ['only in the build', r.onlyBuild], ['only in the snapshot', r.onlySnapshot]]) {
    for (const p of list.slice(0, 30)) console.log(`  ${label}: ${p}`);
    if (list.length > 30) console.log(`  … and ${list.length - 30} more`);
  }
  return r.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.log(`FAIL ${e.message}; 0 files compared`); process.exit(1); }
}
