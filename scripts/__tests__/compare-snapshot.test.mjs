// node --test "scripts/__tests__/compare-snapshot.test.mjs"
// scripts/compare-snapshot.mjs against small trees in a temp folder. The
// failing cases come first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { compare } from '../compare-snapshot.mjs';
import { formatSums } from '../verify-snapshot.mjs';

const SCRIPT = fileURLToPath(new URL('../compare-snapshot.mjs', import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const LIVE = { 'data/EN/book-01.json': '{"a":1}', 'data/lemmata.json': '[]', 'data/_deploy/keys.json': '["x"]', 'app/index.html': '<p>' };

// A snapshot's SHA256SUMS and a build folder that matches its data/ files,
// less the key record (which only the live bucket holds). `change` damages the build.
function trees(change = () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'compare-snapshot-'));
  const build = path.join(dir, 'dist');
  for (const [p, body] of Object.entries(LIVE)) {
    if (!p.startsWith('data/') || p === 'data/_deploy/keys.json') continue;
    mkdirSync(path.join(build, path.dirname(p.slice(5))), { recursive: true });
    writeFileSync(path.join(build, p.slice(5)), body);
  }
  const sums = path.join(dir, 'SHA256SUMS');
  writeFileSync(sums, formatSums(Object.entries(LIVE).map(([p, body]) => ({ path: p, sha256: sha(body) }))));
  const liveOnly = path.join(dir, 'live-only.txt');
  writeFileSync(liveOnly, '# the key record\n_deploy/keys.json\n');
  change(build, dir);
  return { dir, build, sums, liveOnly };
}
const run = (t, ...more) => spawnSync(process.execPath, [SCRIPT, `--sums=${t.sums}`, '--prefix=data/', `--build=${t.build}`, `--live-only=${t.liveOnly}`, ...more], { encoding: 'utf8' });
const clean = (t) => rmSync(t.dir, { recursive: true, force: true });

test('a build file with one changed byte fails and is named', () => {
  const t = trees(build => writeFileSync(path.join(build, 'EN/book-01.json'), '{"a":2}'));
  try {
    const r = run(t);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /differs: EN\/book-01\.json/);
  } finally { clean(t); }
});

test('a file the build makes and live does not serve fails', () => {
  const t = trees(build => writeFileSync(path.join(build, 'new.json'), '{}'));
  try {
    const r = run(t);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /only in the build: new\.json/);
  } finally { clean(t); }
});

test('a file live serves and the build did not make fails, unless the live-only list names it', () => {
  const t = trees(build => rmSync(path.join(build, 'lemmata.json')));
  try {
    const r = run(t);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /only in the snapshot: lemmata\.json/);
    assert.doesNotMatch(r.stdout, /only in the snapshot: _deploy/);
  } finally { clean(t); }
});

test('a live-only list that names a file the build does make fails: the list is stale', () => {
  const t = trees((build, dir) => writeFileSync(path.join(dir, 'live-only.txt'), '_deploy/keys.json\nlemmata.json\n'));
  try {
    const r = run(t);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /live-only list names lemmata\.json, which the build makes/);
  } finally { clean(t); }
});

test('a live-only list that names a file the snapshot does not hold fails', () => {
  const t = trees((build, dir) => writeFileSync(path.join(dir, 'live-only.txt'), '_deploy/keys.json\nnot/there.json\n'));
  try {
    const r = run(t);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /live-only list names not\/there\.json, which the snapshot does not hold/);
  } finally { clean(t); }
});

test('a link in place of a build file fails, though the bytes it points at match', () => {
  const t = trees((build, dir) => {
    writeFileSync(path.join(dir, 'elsewhere.json'), LIVE['data/lemmata.json']);
    rmSync(path.join(build, 'lemmata.json'));
    symlinkSync(path.join(dir, 'elsewhere.json'), path.join(build, 'lemmata.json'));
  });
  try {
    const r = run(t);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /lemmata\.json is a link, not a file/);
  } finally { clean(t); }
});

test('nothing to compare fails: an empty build, and a prefix no snapshot file has', () => {
  const t = trees(build => { rmSync(build, { recursive: true }); mkdirSync(build); });
  try {
    const empty = run(t);
    assert.equal(empty.status, 1);
    assert.match(empty.stdout, /examined nothing|only in the snapshot/);
    const r = spawnSync(process.execPath, [SCRIPT, `--sums=${t.sums}`, '--prefix=nope/', `--build=${t.build}`], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /examined nothing/);
  } finally { clean(t); }
});

test('a matching build passes and says how many files it compared', () => {
  const t = trees();
  try {
    const r = run(t);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ok .*2 of 2 build files are byte for byte what the snapshot holds; 1 live-only file allowed/);
  } finally { clean(t); }
});

test('compare: counts, and a missing build folder is a failure not an empty pass', () => {
  const r = compare(new Map([['a', '1'], ['b', '2']]), new Map([['a', '1'], ['b', '3']]), new Set());
  assert.deepEqual([r.same, r.differ, r.onlyBuild, r.onlySnapshot, r.ok], [1, ['b'], [], [], false]);
  const t = trees();
  try {
    const r2 = spawnSync(process.execPath, [SCRIPT, `--sums=${t.sums}`, '--prefix=data/', `--build=${path.join(t.dir, 'absent')}`], { encoding: 'utf8' });
    assert.equal(r2.status, 1);
    assert.match(r2.stdout, /FAIL/);
  } finally { clean(t); }
});
