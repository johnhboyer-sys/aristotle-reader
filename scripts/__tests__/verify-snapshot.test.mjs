// node --test scripts/__tests__/
// scripts/verify-snapshot.mjs against small trees built in a temp folder.
// The failing cases come first: a check that passes a damaged copy, or one
// that examined nothing, is worse than no check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { formatSums, parseSums, verifyTree } from '../verify-snapshot.mjs';

const SCRIPT = fileURLToPath(new URL('../verify-snapshot.mjs', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');

// A tree of three files with a correct SHA256SUMS; `change` damages it.
function tree(change = () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-snapshot-'));
  const files = { 'app/index.html': '<p>one</p>', 'data/EN/book-01.json': '{"a":1}', 'MANIFEST.json': '{}' };
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(path.join(dir, path.dirname(p)), { recursive: true });
    writeFileSync(path.join(dir, p), body);
  }
  writeFileSync(path.join(dir, 'SHA256SUMS'), formatSums(Object.entries(files).map(([p, body]) => ({ path: p, sha256: sha(body) }))));
  change(dir);
  return dir;
}
const check = (change) => {
  const dir = tree(change);
  try { return verifyTree(dir); } finally { rmSync(dir, { recursive: true }); }
};

test('a flipped byte fails, and names the file', () => {
  const r = check(dir => writeFileSync(path.join(dir, 'data/EN/book-01.json'), '{"a":2}'));
  assert.deepEqual(r.mismatched, ['data/EN/book-01.json']);
  assert.equal(r.ok, false);
});

test('a missing file fails', () => {
  const r = check(dir => rmSync(path.join(dir, 'app/index.html')));
  assert.deepEqual(r.missing, ['app/index.html']);
  assert.equal(r.ok, false);
});

test('a file the list does not name fails', () => {
  const r = check(dir => writeFileSync(path.join(dir, 'data/extra.json'), '{}'));
  assert.deepEqual(r.extra, ['data/extra.json']);
  assert.equal(r.ok, false);
});

test('an empty list fails: it examined nothing', () => {
  const r = check(dir => {
    writeFileSync(path.join(dir, 'SHA256SUMS'), '');
    for (const p of ['app', 'data', 'MANIFEST.json']) rmSync(path.join(dir, p), { recursive: true });
  });
  assert.equal(r.read, 0);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /examined nothing/);
});

test('no SHA256SUMS at all fails', () => {
  const r = check(dir => rmSync(path.join(dir, 'SHA256SUMS')));
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /SHA256SUMS/);
});

test('a list that names a path outside the folder is refused', () => {
  assert.throws(() => parseSums(`${sha('x')}  ../outside.txt\n`), /outside/);
  assert.throws(() => parseSums(`${sha('x')}  /etc/passwd\n`), /outside/);
  assert.throws(() => parseSums('not a checksum line\n'), /line 1/);
  assert.throws(() => parseSums(`${sha('x')}  a.txt\n${sha('y')}  a.txt\n`), /twice/);
});

test('an undamaged tree passes and says how much it read', () => {
  const r = check();
  assert.equal(r.ok, true);
  assert.deepEqual([r.listed, r.read, r.bytes], [3, 3, '<p>one</p>'.length + '{"a":1}'.length + 2]);
  assert.deepEqual([r.missing, r.mismatched, r.extra, r.problems], [[], [], [], []]);
});

test('formatSums writes what shasum -c reads, and parseSums reads it back', () => {
  const entries = [{ path: 'b/two words.json', sha256: sha('2') }, { path: 'a.html', sha256: sha('1') }];
  const text = formatSums(entries);
  assert.equal(text, `${sha('1')}  a.html\n${sha('2')}  b/two words.json\n`);
  assert.deepEqual(parseSums(text), [...entries].reverse());
});

test('the command exits 1 on a damaged folder or archive, 0 on a sound one', () => {
  const good = tree();
  const bad = tree(dir => writeFileSync(path.join(dir, 'app/index.html'), '<p>two</p>'));
  const tar = (dir) => {
    const out = `${dir}.tar.gz`;
    assert.equal(spawnSync('tar', ['-czf', out, '-C', dir, '.']).status, 0);
    return out;
  };
  try {
    const run = (target) => spawnSync(process.execPath, [SCRIPT, target], { encoding: 'utf8' });
    const ok = run(good);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /3 of 3 files read/);
    assert.equal(run(bad).status, 1);
    const okTar = run(tar(good));
    assert.equal(okTar.status, 0, okTar.stdout + okTar.stderr);
    assert.match(okTar.stdout, /3 of 3 files read/);
    assert.equal(run(tar(bad)).status, 1);
    assert.equal(run(path.join(good, 'no-such-folder')).status, 1);
  } finally {
    for (const d of [good, bad]) { rmSync(d, { recursive: true }); rmSync(`${d}.tar.gz`, { force: true }); }
  }
});

// Review findings, 2026-11-20 (Codex). Each passed before its fix.
test('a listed file that is a link to a file outside the folder fails', () => {
  const r = check((dir) => {
    const outside = path.join(dir, '..', `outside-${path.basename(dir)}.json`);
    writeFileSync(outside, '{"a":1}');
    rmSync(path.join(dir, 'data/EN/book-01.json'));
    symlinkSync(outside, path.join(dir, 'data/EN/book-01.json'));
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /data\/EN\/book-01\.json is not a plain file at that name/);
});

test('a folder that is a link fails too', () => {
  const r = check((dir) => {
    const outside = path.join(dir, '..', `outside-dir-${path.basename(dir)}`);
    renameSync(path.join(dir, 'data'), outside);
    symlinkSync(outside, path.join(dir, 'data'));
  });
  assert.equal(r.ok, false);
});

test('parseSums refuses two names that are one file on a Mac', () => {
  const a = 'a'.repeat(64);
  assert.throws(() => parseSums(`${a}  app/A.js\n${a}  app/a.js\n`), /one file/);
  assert.throws(() => parseSums(`${a}  app/\u00e9.js\n${a}  app/e\u0301.js\n`), /one file/);
});

test('formatSums refuses a name with a line break in it', () => {
  assert.throws(() => formatSums([{ path: 'odd\nname.json', sha256: 'a'.repeat(64) }]), /line break/);
});
