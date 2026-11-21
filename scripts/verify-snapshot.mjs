#!/usr/bin/env node
// Verify a snapshot made by scripts/snapshot-live.mjs: every file SHA256SUMS
// names is read and hashed, and every file in the folder must be named.
// Node 22+, no dependencies. HANDOFF-PORTABILITY.md, phase 0.
//
//   node scripts/verify-snapshot.mjs <folder | archive.tar.gz> [more …]
//
// An archive is unpacked to a temp folder first (system `tar`), so a copy in
// iCloud, on a drive, or downloaded from a release is checked as it sits.
// It fails on a changed byte, a missing file, a file the list does not name,
// and a list with no entries, and it prints how many files it read.
// SHA256SUMS is in the format `shasum -a 256 -c SHA256SUMS` reads, so a copy
// can be checked without this script.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const SUMS = 'SHA256SUMS';

// Two names a Mac's file system holds as one file: same letters in another
// case, or the same accents composed another way.
export const pathKey = (p) => p.normalize('NFC').toLowerCase();

export function formatSums(entries) {
  for (const e of entries) if (/[\n\r]/.test(e.path)) throw new Error(`a file name with a line break in it cannot be listed: ${JSON.stringify(e.path)}`);
  return [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(e => `${e.sha256}  ${e.path}\n`).join('');
}

export function parseSums(text) {
  const entries = [];
  const seen = new Set(), keys = new Map();
  text.split('\n').forEach((line, i) => {
    if (line === '') return;
    const m = line.match(/^([0-9a-f]{64}) [ *](.+)$/);
    if (!m) throw new Error(`${SUMS} line ${i + 1} is not a checksum line`);
    const p = m[2];
    if (path.isAbsolute(p) || p.split('/').includes('..')) throw new Error(`${SUMS} line ${i + 1} names a path outside the folder: ${p}`);
    if (seen.has(p)) throw new Error(`${SUMS} names ${p} twice`);
    if (keys.has(pathKey(p))) throw new Error(`${SUMS} names ${keys.get(pathKey(p))} and ${p}, which are one file on a Mac`);
    seen.add(p);
    keys.set(pathKey(p), p);
    entries.push({ sha256: m[1], path: p });
  });
  return entries;
}

function* walk(dir, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, base);
    else yield path.relative(base, full).split(path.sep).join('/');
  }
}

export function verifyTree(dir) {
  const report = { dir, listed: 0, read: 0, bytes: 0, missing: [], mismatched: [], extra: [], problems: [], ok: false };
  const sumsPath = path.join(dir, SUMS);
  if (!existsSync(sumsPath)) {
    report.problems.push(`no ${SUMS} in ${dir}`);
    return report;
  }
  const entries = parseSums(readFileSync(sumsPath, 'utf8'));
  report.listed = entries.length;
  const listed = new Set(entries.map(e => e.path));
  const root = realpathSync(dir);
  for (const e of entries) {
    const full = path.join(dir, e.path);
    if (!existsSync(full) || !statSync(full).isFile()) { report.missing.push(e.path); continue; }
    // A link, a linked folder, or a name spelled another way on disk: the
    // bytes read would not be the bytes a copy of this folder carries.
    if (realpathSync(full) !== path.join(root, e.path)) { report.problems.push(`${e.path} is not a plain file at that name (a link, or spelled differently on disk)`); continue; }
    const body = readFileSync(full);
    report.read++;
    report.bytes += body.length;
    if (createHash('sha256').update(body).digest('hex') !== e.sha256) report.mismatched.push(e.path);
  }
  for (const p of walk(dir)) if (p !== SUMS && !listed.has(p)) report.extra.push(p);
  if (report.read === 0) report.problems.push(`examined nothing: ${SUMS} names ${report.listed} files and 0 were read`);
  report.ok = report.problems.length === 0 && report.missing.length === 0
    && report.mismatched.length === 0 && report.extra.length === 0;
  return report;
}

// A folder is checked in place; an archive is unpacked next to the temp root.
export function verifyTarget(target) {
  if (!existsSync(target)) return { dir: target, listed: 0, read: 0, bytes: 0, missing: [], mismatched: [], extra: [], problems: [`${target} does not exist`], ok: false };
  if (statSync(target).isDirectory()) return verifyTree(target);
  const tmp = mkdtempSync(path.join(tmpdir(), 'verify-snapshot-'));
  try {
    // A bare environment: GNU tar takes options from TAR_OPTIONS, and one
    // that renames files as they unpack would make this check read other bytes.
    const r = spawnSync('tar', ['-xzf', target, '-C', tmp], { encoding: 'utf8', env: { PATH: process.env.PATH } });
    if (r.status !== 0) return { dir: target, listed: 0, read: 0, bytes: 0, missing: [], mismatched: [], extra: [], problems: [`tar could not unpack ${target}: ${r.stderr.trim()}`], ok: false };
    return { ...verifyTree(tmp), dir: target };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  if (argv.length === 0 || argv.includes('--help')) {
    console.log('usage: node scripts/verify-snapshot.mjs <folder | archive.tar.gz> [more …]');
    return argv.length === 0 ? 1 : 0;
  }
  let bad = 0;
  for (const target of argv) {
    const r = verifyTarget(target);
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${target}: ${r.read} of ${r.listed} files read, ${r.bytes} bytes; `
      + `${r.mismatched.length} changed, ${r.missing.length} missing, ${r.extra.length} not in the list`);
    for (const p of r.problems) console.log(`  ${p}`);
    for (const [label, list] of [['changed', r.mismatched], ['missing', r.missing], ['not in the list', r.extra]]) {
      for (const p of list.slice(0, 20)) console.log(`  ${label}: ${p}`);
      if (list.length > 20) console.log(`  … and ${list.length - 20} more ${label}`);
    }
    if (!r.ok) bad++;
  }
  return bad ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
