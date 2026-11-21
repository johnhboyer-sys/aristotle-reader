// node --test "scripts/__tests__/mirror-check.test.mjs"
// scripts/mirror-check.mjs against real git repos made in a temp folder. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareRefs, parseLsRemote } from '../mirror-check.mjs';

const SCRIPT = fileURLToPath(new URL('../mirror-check.mjs', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });

// A source with two branches, gh-pages, and a tag; a mirror pushed the way the
// plan says (heads and tags, less gh-pages).
function repos() {
  // The folder name has a space and a literal %20 in it: both must survive the clone.
  const dir = mkdtempSync(path.join(tmpdir(), 'mirror check%20-'));
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
  git(src, 'push', '-q', mirror, 'refs/heads/*:refs/heads/*', 'refs/tags/*:refs/tags/*', '^refs/heads/gh-pages');
  return { dir, src, mirror, commit };
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

// The failing cases first.
test('a ref deleted from the mirror fails the check and is named', () => {
  const { dir, src, mirror } = repos();
  try {
    git(mirror, 'update-ref', '-d', 'refs/heads/feature');
    const r = run(`--source=${src}`, `--mirror=${mirror}`);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /missing on the mirror: refs\/heads\/feature/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a branch that moved on the source after the push fails the check', () => {
  const { dir, src, mirror, commit } = repos();
  try {
    commit('c');
    const r = run(`--source=${src}`, `--mirror=${mirror}`);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /differs: refs\/heads\/main/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a source with no refs fails: the check examined nothing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mirror-check-'));
  try {
    for (const n of ['a.git', 'b.git']) git(dir, 'init', '-q', '--bare', path.join(dir, n));
    const r = run(`--source=${path.join(dir, 'a.git')}`, `--mirror=${path.join(dir, 'b.git')}`);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /examined nothing/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a remote that cannot be read fails, and is not taken for an empty one', () => {
  const { dir, src } = repos();
  try {
    const r = run(`--source=${src}`, `--mirror=${path.join(dir, 'nowhere.git')}`);
    assert.equal(r.status, 1);
    assert.match(r.stdout + r.stderr, /could not read/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a whole mirror passes, says how many refs it compared, and leaves gh-pages out', () => {
  const { dir, src, mirror } = repos();
  try {
    const r = run(`--source=${src}`, `--mirror=${mirror}`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    // main, feature, and v1 (its peeled commit is compared, and is not a fourth ref)
    assert.match(r.stdout, /ok .*3 of 3 refs match; 1 skipped \(refs\/heads\/gh-pages\); history: 2 commits, whole/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('compareRefs: a ref only the mirror holds is reported and does not fail', () => {
  const source = parseLsRemote('aaa\trefs/heads/main\nbbb\trefs/heads/gh-pages\n');
  const mirror = parseLsRemote('aaa\trefs/heads/main\nccc\trefs/heads/old\n');
  const r = compareRefs(source, mirror);
  assert.deepEqual([r.examined, r.matched, r.missing, r.differ, r.extra, r.skipped, r.ok],
    [1, 1, [], [], ['refs/heads/old'], ['refs/heads/gh-pages'], true]);
  assert.throws(() => parseLsRemote('not a ref line\n'), /ls-remote/);
});

// Second review pass, 2026-11-20 (Codex).
test('a shallow mirror with the right branch tip fails: the tips match and the history is not there', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mirror-check-'));
  try {
    const src = path.join(dir, 'src'), mirror = path.join(dir, 'mirror.git');
    git(dir, 'init', '-q', '-b', 'main', src);
    git(src, 'config', 'user.email', 't@example.invalid');
    git(src, 'config', 'user.name', 't');
    for (const n of ['a', 'b', 'c']) { writeFileSync(path.join(src, n), n); git(src, 'add', n); git(src, 'commit', '-q', '-m', n); }
    git(dir, 'clone', '-q', '--bare', '--depth', '1', `file://${src}`, mirror);
    const tips = run(`--source=${src}`, `--mirror=${mirror}`, '--tips-only');
    assert.equal(tips.status, 0, tips.stdout + tips.stderr);
    assert.match(tips.stdout, /history not checked/);
    const whole = run(`--source=${src}`, `--mirror=${mirror}`);
    assert.equal(whole.status, 1, whole.stdout + whole.stderr);
    assert.match(whole.stdout, /shallow|not whole/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('skipping a tag skips its peeled line; a ref name with an odd space in it still parses', () => {
  const source = parseLsRemote('aaa\trefs/heads/main\nbbb\trefs/tags/v1\nccc\trefs/tags/v1^{}\nddd\trefs/heads/a\u00a0b\n');
  const mirror = parseLsRemote('aaa\trefs/heads/main\nddd\trefs/heads/a\u00a0b\n');
  const r = compareRefs(source, mirror, ['refs/tags/v1']);
  assert.deepEqual([r.examined, r.matched, r.missing, r.ok], [2, 2, [], true]);
  const peeled = compareRefs(source, parseLsRemote('aaa\trefs/heads/main\nbbb\trefs/tags/v1\nzzz\trefs/tags/v1^{}\nddd\trefs/heads/a\u00a0b\n'.replace('zzz', 'eee')));
  assert.deepEqual([peeled.examined, peeled.differ, peeled.ok], [3, ['refs/tags/v1^{}'], false]);
});
