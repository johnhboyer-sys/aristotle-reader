#!/usr/bin/env node
// Push a repo's branches and tags to a second git host. HANDOFF-PORTABILITY.md,
// phases 0 and 3. Node 22+, no dependencies.
//
//   node scripts/mirror-git.mjs --source=<url or path> --mirror=<url or path>
//     [--skip=<ref>,<ref>]       left out; default refs/heads/gh-pages (decision 7)
//     [--no-force=<ref>,<ref>]   more branches never pushed over; refs/heads/main always is
//
// The source is fetched whole into a temp folder (never from the checkout it
// runs in: a CI checkout is shallow, and a mirror pushed from one has the
// right tips and no history), then every branch and tag is pushed to the
// mirror, and `git ls-remote` on both is compared (mirror-check.mjs's
// comparison).
//
// A mirror is a backup, so it gives way slowly. A tag, and main, are pushed
// without force: if either was rewritten at the source the push is refused,
// the mirror keeps what it had, and this exits 1. Other branches are rebased
// in the course of work and are pushed over. A refused ref does not hold the
// others back: they still go, and the run still fails. Nothing is ever deleted
// from the mirror: a ref only it holds is printed.
//
// What it does not prove: that the mirror's history is whole. A mirror that
// was shallow before this ran, with the right tips, passes here;
// mirror-check.mjs clones the mirror and asks.
//
// Exit 1 when the source or the mirror cannot be read, the source is shallow
// or has no branch or tag (examined nothing), a push is refused, or the two
// do not match afterwards. An address must be a folder that exists, or
// https://, ssh://, file://, or user@host:path; anything else is refused
// before git sees it (git reads "-x" as an option and "ext::cmd" as a program
// to run). One with a password in it is refused: a key belongs in the
// environment (GIT_SSH_COMMAND, a credential helper).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { compareRefs, DEFAULT_SKIP, parseLsRemote } from './mirror-check.mjs';

export const DEFAULT_NO_FORCE = ['refs/heads/main'];

const git = (args, opts = {}) => spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
const said = (r) => (r.stderr || r.stdout || String(r.error || '')).trim();
// A plain path would be fetched by reading files in place, a shallow marker
// unseen; file:// makes git fetch it as it would from a host.
const asUrl = (remote) => (existsSync(remote) ? pathToFileURL(path.resolve(remote)).href : remote);
export const hasPassword = (remote) => /:\/\/[^/@\s]*:[^/@\s]*@/.test(remote);
export const isAddress = (remote) => !remote.startsWith('-')
  && (existsSync(remote) || /^(https|ssh|file):\/\/[^\s:]\S*$/.test(remote) || /^[\w.-]+@[\w.-]+:[^\s:]\S*$/.test(remote));

// One refspec a ref: tags and the named branches as they are, the rest forced.
export function refspecs(refs, noForce = []) {
  const kept = [...DEFAULT_NO_FORCE, ...noForce];
  return refs.map((ref) => `${ref.startsWith('refs/heads/') && !kept.includes(ref) ? '+' : ''}${ref}:${ref}`);
}

export function mirrorGit({ source, mirror, skip = DEFAULT_SKIP, noForce = [] }) {
  const fail = (problem) => ({ ok: false, problems: [problem], examined: 0, matched: 0, extra: [], skipped: [] });
  if (hasPassword(source) || hasPassword(mirror)) return fail('an address has a password in it; put the key in the environment, not in the address');
  for (const [name, remote] of [['source', source], ['mirror', mirror]]) {
    if (!isAddress(remote)) return fail(`the ${name} is not an address this takes: a folder that exists, https://, ssh://, file://, or user@host:path`);
  }
  const tmp = mkdtempSync(path.join(tmpdir(), 'mirror-git-'));
  try {
    if (git(['init', '--quiet', '--bare', tmp]).status !== 0) return fail(`could not make a work folder at ${tmp}`);
    // --update-shallow: without it git leaves out, in silence, every ref of a
    // shallow source; with it they come, and the check below can say why it stops.
    const fetch = git(['fetch', '--quiet', '--no-tags', '--update-shallow', asUrl(source), '+refs/heads/*:refs/heads/*', '+refs/tags/*:refs/tags/*', ...skip.map((ref) => `^${ref}`)], { cwd: tmp });
    if (fetch.status !== 0) return fail(`could not fetch ${source}: ${said(fetch)}`);
    if (git(['rev-parse', '--is-shallow-repository'], { cwd: tmp }).stdout.trim() !== 'false') {
      return fail('the source is shallow: its branch tips are there and the history under them is not; nothing was pushed');
    }
    const refs = git(['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/tags'], { cwd: tmp }).stdout.split('\n').filter(Boolean);
    if (!refs.length) return fail('the source has no branch or tag to push: examined nothing');

    const push = git(['push', '--quiet', asUrl(mirror), ...refspecs(refs, noForce)], { cwd: tmp });
    const ls = (remote) => {
      const r = git(['ls-remote', '--heads', '--tags', asUrl(remote)]);
      if (r.status !== 0) throw new Error(`could not read ${remote}: ${said(r)}`);
      return parseLsRemote(r.stdout);
    };
    let result;
    try { result = compareRefs(ls(source), ls(mirror), skip); } catch (e) {
      return fail(push.status !== 0 ? `the push to ${mirror} failed: ${said(push)}` : e.message);
    }
    if (push.status !== 0) {
      const refused = said(push).split('\n').filter((line) => /^\s*!/.test(line)).map((line) => line.trim());
      result.problems.unshift(...(refused.length ? refused.map((line) => `refused by the mirror: ${line}`) : [`the push failed: ${said(push)}`]));
    }
    return { ...result, ok: result.problems.length === 0, pushed: refs.length };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--(source|mirror|skip|no-force)=(.+)$/s);
    if (!m) throw new Error(`unknown argument ${a}`);
    args[m[1]] = m[2];
  }
  if (!args.source || !args.mirror) throw new Error('usage: mirror-git.mjs --source=<remote> --mirror=<remote> [--skip=<ref>,<ref>] [--no-force=<ref>,<ref>]');
  const r = mirrorGit({
    source: args.source, mirror: args.mirror,
    skip: args.skip ? args.skip.split(',') : DEFAULT_SKIP,
    noForce: args['no-force'] ? args['no-force'].split(',') : [],
  });
  const where = hasPassword(args.mirror) || !isAddress(args.mirror) ? 'the mirror' : args.mirror;
  const skippedNote = r.skipped.length ? `; ${r.skipped.length} left out (${r.skipped.join(', ')})` : '';
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${where}: ${r.matched} of ${r.examined} refs match the source after the push${skippedNote}; history not checked here (mirror-check.mjs does)`);
  for (const p of r.problems) console.log(`  ${p}`);
  for (const e of r.extra) console.log(`  only on the mirror: ${e}`);
  return r.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { process.exit(main(process.argv.slice(2))); } catch (e) { console.log(`FAIL ${e.message}; nothing pushed`); process.exit(1); }
}
