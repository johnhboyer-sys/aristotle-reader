#!/usr/bin/env node
// Is a git mirror whole? HANDOFF-PORTABILITY.md, phase 0. Node 22+, no dependencies.
//
//   node scripts/mirror-check.mjs --source=<url or path> --mirror=<url or path> [--skip=<ref>,<ref>] [--tips-only]
//
// Two checks. Tips: `git ls-remote --heads --tags` on both; every source ref
// must be on the mirror at the same object. History: the mirror is cloned to a
// temp folder, must not be shallow, and must pass `git fsck
// --connectivity-only`. Matching tips say nothing about the commits under
// them: a mirror pushed from a shallow CI checkout has the right tips and no
// history. --tips-only skips the clone and says so.
//
// Exit 1 when a source ref is missing on the mirror or points at another
// object, when either remote cannot be read, when the source has no refs to
// compare (a check that examined nothing has not passed), and when the
// mirror's history is not whole. A ref only the mirror holds is printed and
// does not fail: a branch deleted at the source is not lost work. gh-pages is
// skipped by default: it is each reader's old build history, 0.3 to 2 GB, and
// stays on GitHub (decision 7).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_SKIP = ['refs/heads/gh-pages'];
const PEELED = '^{}';
const base = (ref) => (ref.endsWith(PEELED) ? ref.slice(0, -PEELED.length) : ref);

// "<object>\t<ref>" lines to a Map of ref -> object. An annotated tag has a
// second line, "<commit>\trefs/tags/v1^{}"; it is kept and compared.
export function parseLsRemote(text) {
  const refs = new Map();
  for (const line of text.split('\n')) {
    if (!line) continue;
    const m = line.match(/^([0-9a-f]+)\t(refs\/[^\t]+)$/);
    if (!m) throw new Error(`not a git ls-remote line: ${JSON.stringify(line)}`);
    refs.set(m[2], m[1]);
  }
  return refs;
}

// examined and matched count refs; a tag and its peeled line are one ref.
export function compareRefs(source, mirror, skip = DEFAULT_SKIP) {
  const skipped = [...source.keys()].filter(r => r === base(r) && skip.includes(r));
  const wanted = [...source.keys()].filter(r => !skip.includes(base(r)));
  const missing = wanted.filter(r => !mirror.has(r));
  const differ = wanted.filter(r => mirror.has(r) && mirror.get(r) !== source.get(r));
  const extra = [...mirror.keys()].filter(r => !source.has(r));
  const refs = new Set(wanted.map(base));
  const bad = new Set([...missing, ...differ].map(base));
  const problems = [
    ...(refs.size === 0 ? ['the source has no refs to compare: examined nothing'] : []),
    ...missing.map(r => `missing on the mirror: ${r}`),
    ...differ.map(r => `differs: ${r} is ${source.get(r)} at the source and ${mirror.get(r)} on the mirror`),
  ];
  return { examined: refs.size, matched: refs.size - bad.size, missing, differ, extra, skipped, problems, ok: problems.length === 0 };
}

const git = (args, opts = {}) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });

function lsRemote(remote) {
  const r = git(['ls-remote', '--heads', '--tags', remote]);
  if (r.status !== 0) throw new Error(`could not read ${remote}: ${(r.stderr || String(r.error)).trim()}`);
  return parseLsRemote(r.stdout);
}

// Clone the mirror and ask git whether every commit, tree and file its refs
// need is there. Returns { commits } or { problem }.
export function historyOf(mirror) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'mirror-check-'));
  try {
    // A plain path would be cloned by copying files, shallow marker and all
    // left behind; file:// makes git fetch it as it would from a host.
    const from = existsSync(mirror) ? pathToFileURL(path.resolve(mirror)).href : mirror;
    const clone = git(['clone', '--quiet', '--mirror', from, tmp]);
    if (clone.status !== 0) return { problem: `could not clone ${mirror}: ${clone.stderr.trim()}` };
    if (git(['rev-parse', '--is-shallow-repository'], { cwd: tmp }).stdout.trim() !== 'false') {
      return { problem: 'the mirror is shallow: its branch tips are there and the history under them is not' };
    }
    const fsck = git(['fsck', '--connectivity-only', '--no-dangling'], { cwd: tmp });
    if (fsck.status !== 0) return { problem: `the mirror's history is not whole: ${(fsck.stderr || fsck.stdout).trim().split('\n').slice(0, 3).join('; ')}` };
    const count = git(['rev-list', '--count', '--all'], { cwd: tmp });
    const commits = Number(count.stdout.trim());
    if (count.status !== 0 || !(commits > 0)) return { problem: 'the clone of the mirror holds no commits: examined nothing' };
    return { commits };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--(source|mirror|skip)=(.+)$/s);
    if (m) args[m[1]] = m[2];
    else if (a === '--tips-only') args.tipsOnly = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!args.source || !args.mirror) throw new Error('usage: mirror-check.mjs --source=<remote> --mirror=<remote> [--skip=<ref>,<ref>] [--tips-only]');
  const skip = args.skip ? args.skip.split(',') : DEFAULT_SKIP;
  const r = compareRefs(lsRemote(args.source), lsRemote(args.mirror), skip);
  const history = r.ok && !args.tipsOnly ? historyOf(args.mirror) : null;
  if (history?.problem) r.problems.push(history.problem);
  const ok = r.problems.length === 0;
  const skippedNote = r.skipped.length ? `; ${r.skipped.length} skipped (${r.skipped.join(', ')})` : '';
  const historyNote = args.tipsOnly ? '; history not checked (--tips-only)' : history?.commits ? `; history: ${history.commits} commits, whole` : '';
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${args.mirror}: ${r.matched} of ${r.examined} refs match${skippedNote}${historyNote}`);
  for (const p of r.problems) console.log(`  ${p}`);
  for (const e of r.extra) console.log(`  only on the mirror: ${e}`);
  return ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.log(`FAIL ${e.message}; 0 refs compared`); process.exit(1); }
}
