#!/usr/bin/env node
// Does a build make what the live site served? HANDOFF-PORTABILITY.md, test 2.
// Node 22+, no dependencies.
//
//   node scripts/compare-snapshot.mjs --sums=<snapshot>/SHA256SUMS --prefix=data/ \
//     --build=app/dist/data [--live-only=<list>]
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
// This proves a change to the BUILD left its output alone. It is run against
// the commit the snapshot was taken at; after the corpus changes, a
// difference is the change and not a fault.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
    const m = a.match(/^--(sums|prefix|build|live-only)=(.*)$/s);
    if (!m) throw new Error(`unknown argument ${a}`);
    args[m[1]] = m[2];
  }
  if (!args.sums || !args.build) throw new Error('usage: compare-snapshot.mjs --sums=<SHA256SUMS> --build=<folder> [--prefix=data/] [--live-only=<list>]');
  const prefix = args.prefix ?? '';
  if (!existsSync(args.build) || !statSync(args.build).isDirectory()) throw new Error(`${args.build} is not a folder`);
  const snapshot = new Map(parseSums(readFileSync(args.sums, 'utf8'))
    .filter(e => e.path.startsWith(prefix)).map(e => [e.path.slice(prefix.length), e.sha256]));
  const { files, links } = walk(args.build);
  const built = new Map(files.map(p => [p, createHash('sha256').update(readFileSync(path.join(args.build, p))).digest('hex')]));
  const liveOnly = new Set(args['live-only']
    ? readFileSync(args['live-only'], 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')) : []);
  const r = compare(snapshot, built, liveOnly);
  for (const p of links) r.problems.push(`${p} is a link, not a file`);
  if (links.length) r.ok = false;
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${args.build}: ${r.same} of ${built.size} build files are byte for byte what the snapshot holds; `
    + `${r.allowed} live-only file${r.allowed === 1 ? '' : 's'} allowed; ${r.differ.length} differ, ${r.onlyBuild.length} only in the build, ${r.onlySnapshot.length} only in the snapshot`);
  for (const p of r.problems) console.log(`  ${p}`);
  for (const [label, list] of [['differs', r.differ], ['only in the build', r.onlyBuild], ['only in the snapshot', r.onlySnapshot]]) {
    for (const p of list.slice(0, 30)) console.log(`  ${label}: ${p}`);
    if (list.length > 30) console.log(`  … and ${list.length - 30} more`);
  }
  return r.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.log(`FAIL ${e.message}; 0 files compared`); process.exit(1); }
}
