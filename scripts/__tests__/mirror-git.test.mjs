// node --test "scripts/__tests__/mirror-git.test.mjs"
// scripts/mirror-git.mjs against real git repos made in a temp folder. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { refspecs } from '../mirror-git.mjs';

const SCRIPT = fileURLToPath(new URL('../mirror-git.mjs', import.meta.url));
const CHECK = fileURLToPath(new URL('../mirror-check.mjs', import.meta.url));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV }).trim();

// A source with main, a feature branch, gh-pages, and an annotated tag; an
// empty bare repo to mirror into.
function repos() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mirror git%20-'));
  const src = path.join(dir, 'src'), mirror = path.join(dir, 'mirror.git');
  git(dir, 'init', '-q', '-b', 'main', src);
  git(src, 'config', 'user.email', 't@example.invalid');
  git(src, 'config', 'user.name', 't');
  const commit = (name) => { writeFileSync(path.join(src, name), name); git(src, 'add', name); git(src, 'commit', '-q', '-m', name); };
  commit('a');
  git(src, 'tag', '-a', 'v1', '-m', 'v1');
  git(src, 'branch', 'feature');
  git(src, 'branch', 'gh-pages');
  commit('b');
  git(dir, 'init', '-q', '--bare', mirror);
  return { dir, src, mirror, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: ENV });
const mirrorTo = (r) => run(`--source=${r.src}`, `--mirror=${r.mirror}`);
const at = (repo, ref) => git(repo, 'rev-parse', ref);
const has = (repo, ref) => spawnSync('git', ['rev-parse', '--verify', '--quiet', ref], { cwd: repo, env: ENV }).status === 0;

// The failing cases first.
test('mirror-git: a rewritten main is refused, named, and left as it was on the mirror', () => {
  const r = repos();
  try {
    assert.equal(mirrorTo(r).status, 0);
    const before = at(r.mirror, 'refs/heads/main');
    git(r.src, 'reset', '-q', '--hard', 'HEAD~1');
    r.commit('c');
    git(r.src, 'switch', '-q', 'feature');
    r.commit('f');
    const out = mirrorTo(r);
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /^FAIL /m);
    assert.match(out.stdout, /refused by the mirror: .*main/);
    assert.equal(at(r.mirror, 'refs/heads/main'), before);
    // The other branches still went.
    assert.equal(at(r.mirror, 'refs/heads/feature'), at(r.src, 'refs/heads/feature'));
  } finally { r.done(); }
});

test('mirror-git: a moved tag is refused and left as it was on the mirror', () => {
  const r = repos();
  try {
    assert.equal(mirrorTo(r).status, 0);
    const before = at(r.mirror, 'refs/tags/v1');
    git(r.src, 'tag', '-f', '-a', 'v1', '-m', 'moved');
    const out = mirrorTo(r);
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /refs\/tags\/v1/);
    assert.equal(at(r.mirror, 'refs/tags/v1'), before);
  } finally { r.done(); }
});

test('mirror-git: a shallow source is refused and nothing is pushed', () => {
  const r = repos();
  try {
    const shallow = path.join(r.dir, 'shallow');
    git(r.dir, 'clone', '-q', '--depth', '1', pathToFileURL(r.src).href, shallow);
    const out = run(`--source=${shallow}`, `--mirror=${r.mirror}`);
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /the source is shallow/);
    assert.equal(git(r.mirror, 'for-each-ref'), '');
  } finally { r.done(); }
});

test('mirror-git: a source with no branches or tags fails and says it examined nothing', () => {
  const r = repos();
  try {
    const empty = path.join(r.dir, 'empty.git');
    git(r.dir, 'init', '-q', '--bare', empty);
    const out = run(`--source=${empty}`, `--mirror=${r.mirror}`);
    assert.equal(out.status, 1, out.stdout + out.stderr);
    assert.match(out.stdout, /examined nothing/);
  } finally { r.done(); }
});

test('mirror-git: a source or a mirror that cannot be read fails', () => {
  const r = repos();
  try {
    const noSource = run(`--source=${path.join(r.dir, 'nowhere')}`, `--mirror=${r.mirror}`);
    assert.equal(noSource.status, 1);
    assert.match(noSource.stdout, /^FAIL /m);
    assert.match(noSource.stdout, /could not fetch/);
    const noMirror = run(`--source=${r.src}`, `--mirror=${path.join(r.dir, 'nowhere.git')}`);
    assert.equal(noMirror.status, 1);
    assert.match(noMirror.stdout, /^FAIL /m);
  } finally { r.done(); }
});

test('mirror-git: an address with a password in it is refused, and the password is not printed', () => {
  const r = repos();
  try {
    for (const args of [[`--source=${r.src}`, '--mirror=https://oauth2:hunter2secret@gitlab.example/a/b.git'], ['--source=https://u:hunter2secret@github.example/a/b.git', `--mirror=${r.mirror}`]]) {
      const out = run(...args);
      assert.equal(out.status, 1, out.stdout + out.stderr);
      assert.match(out.stdout, /password/);
      assert.doesNotMatch(out.stdout + out.stderr, /hunter2secret/);
    }
  } finally { r.done(); }
});

test('mirror-git: arguments', () => {
  assert.equal(run('--source=a').status, 1);
  assert.equal(run('--mirror=a').status, 1);
  assert.match(run('--source=a', '--mirror=b', '--nope').stdout, /unknown argument/);
});

// What it must do.
test('mirror-git: an empty mirror gets every branch and tag but gh-pages, with whole history', () => {
  const r = repos();
  try {
    const out = mirrorTo(r);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /^ok {3}.*3 of 3 refs match/m);
    assert.match(out.stdout, /refs\/heads\/gh-pages/);   // says what it left out
    for (const ref of ['refs/heads/main', 'refs/heads/feature', 'refs/tags/v1']) assert.equal(at(r.mirror, ref), at(r.src, ref), ref);
    assert.equal(has(r.mirror, 'refs/heads/gh-pages'), false);
    const check = spawnSync(process.execPath, [CHECK, `--source=${r.src}`, `--mirror=${r.mirror}`], { encoding: 'utf8', env: ENV });
    assert.equal(check.status, 0, check.stdout);
    assert.match(check.stdout, /history: 2 commits, whole/);
  } finally { r.done(); }
});

test('mirror-git: a new commit on main and a new tag follow; a second run with nothing new passes', () => {
  const r = repos();
  try {
    assert.equal(mirrorTo(r).status, 0);
    r.commit('c');
    git(r.src, 'tag', 'deploy/2026-11-21');
    assert.equal(mirrorTo(r).status, 0);
    assert.equal(at(r.mirror, 'refs/heads/main'), at(r.src, 'refs/heads/main'));
    assert.equal(at(r.mirror, 'refs/tags/deploy/2026-11-21'), at(r.src, 'refs/tags/deploy/2026-11-21'));
    const again = mirrorTo(r);
    assert.equal(again.status, 0, again.stdout);
    assert.match(again.stdout, /4 of 4 refs match/);
  } finally { r.done(); }
});

test('mirror-git: a rewritten branch other than main is pushed over the old one', () => {
  const r = repos();
  try {
    assert.equal(mirrorTo(r).status, 0);
    git(r.src, 'switch', '-q', 'feature');
    git(r.src, 'commit', '-q', '--amend', '-m', 'a, reworded');
    const out = mirrorTo(r);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(at(r.mirror, 'refs/heads/feature'), at(r.src, 'refs/heads/feature'));
  } finally { r.done(); }
});

test('mirror-git: a branch deleted at the source stays on the mirror and is listed', () => {
  const r = repos();
  try {
    assert.equal(mirrorTo(r).status, 0);
    git(r.src, 'branch', '-q', '-D', 'feature');
    const out = mirrorTo(r);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(has(r.mirror, 'refs/heads/feature'), true);
    assert.match(out.stdout, /only on the mirror: refs\/heads\/feature/);
  } finally { r.done(); }
});

test('mirror-git: --skip leaves other refs out, and replaces the default', () => {
  const r = repos();
  try {
    const out = run(`--source=${r.src}`, `--mirror=${r.mirror}`, '--skip=refs/heads/feature');
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(has(r.mirror, 'refs/heads/feature'), false);
    assert.equal(has(r.mirror, 'refs/heads/gh-pages'), true);
  } finally { r.done(); }
});

test('mirror-git: refspecs force every branch but the ones named, and no tag', () => {
  assert.deepEqual(
    refspecs(['refs/heads/main', 'refs/heads/claude/x', 'refs/tags/v1'], ['refs/heads/main']),
    ['refs/heads/main:refs/heads/main', '+refs/heads/claude/x:refs/heads/claude/x', 'refs/tags/v1:refs/tags/v1'],
  );
});
