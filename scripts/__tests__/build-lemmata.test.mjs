// node --test scripts/__tests__/
// app/scripts/build-lemmata.mjs walks public/data relative to its cwd, so it
// is exercised by spawning it inside a fixture tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../../app/scripts/build-lemmata.mjs', import.meta.url));

// A data tree with no work that qualifies (only the LSJ shard directory) but
// with a previous run's outputs still on disk — the state an app-only build
// meets when build/dist is present but the pipeline has not produced a work.
test('refuses to run on a data tree with no works and leaves the previous outputs alone', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'build-lemmata-'));
  const data = path.join(root, 'public', 'data');
  mkdirSync(path.join(data, 'lsj'), { recursive: true });
  mkdirSync(path.join(data, 'lemmata'), { recursive: true });
  writeFileSync(path.join(data, 'lemmata.json'), '{"keep":1}');
  writeFileSync(path.join(data, 'lemmata', 'keep.json'), '{}');
  try {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /refusing/);
    assert.doesNotMatch(r.stderr, /TypeError/);
    assert.equal(readFileSync(path.join(data, 'lemmata.json'), 'utf8'), '{"keep":1}');
    assert.ok(existsSync(path.join(data, 'lemmata', 'keep.json')), 'previous lemma pages were not wiped');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

// ── Stable slugs ────────────────────────────────────────────────────────────
// /lemma/<slug> addresses are out in the world. Slugs used to be handed out in
// frequency order, so adding a work that made χωρίον commoner than χόριον
// swapped /lemma/chorion and /lemma/chorion-2. The record of every slug ever
// issued (LEMMA_SLUGS_PATH) is the authority: a recorded key keeps its slug, a
// new key never takes a recorded one, and nothing is ever dropped from it.

// One Aristotle work whose tokens are `counts` = { lsjKey: n }.
function addWork(data, name, counts) {
  const dir = path.join(data, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ work: { author: 'Aristotle', title: name } }));
  const analyses = {};
  const tokens = [];
  for (const [key, n] of Object.entries(counts)) {
    analyses[key] = [{ lemma: key, lsj: [key], parse: 'noun', gloss: 'g' }];
    for (let i = 0; i < n; i++) tokens.push({ k: key, t: key });
  }
  writeFileSync(path.join(dir, 'analyses.json'), JSON.stringify(analyses));
  writeFileSync(path.join(dir, 'book-01.json'), JSON.stringify({
    book: 1, segments: [{ column: '1a', greek: [{ n: 1, tokens }] }],
  }));
}

function fixture(record) {
  const root = mkdtempSync(path.join(tmpdir(), 'build-lemmata-'));
  const data = path.join(root, 'public', 'data');
  mkdirSync(path.join(data, 'lsj'), { recursive: true });
  const rec = path.join(root, 'lemma-slugs.json');
  if (record !== undefined) writeFileSync(rec, JSON.stringify(record));
  return { root, data, rec };
}

function run({ root, rec }) {
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: root, encoding: 'utf8', env: { ...process.env, LEMMA_SLUGS_PATH: rec },
  });
  return r;
}

const slugsOf = (data) => Object.fromEntries(
  JSON.parse(readFileSync(path.join(data, 'lemmata', '_index.json'), 'utf8')).map((e) => [e.key, e.slug]),
);

test('adding a work does not change any existing key\'s slug', () => {
  const f = fixture({});
  try {
    // χόριον (xo/ri^on) and χωρίον (xwri/on) both slugify to "chorion".
    addWork(f.data, 'A', { 'xo/ri^on': 5, 'xwri/on': 3 });
    let r = run(f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const before = slugsOf(f.data);
    assert.deepEqual(before, { 'xo/ri^on': 'chorion', 'xwri/on': 'chorion-2' });

    // A second work makes χωρίον the commoner word.
    addWork(f.data, 'B', { 'xwri/on': 10 });
    r = run(f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const after = slugsOf(f.data);
    for (const [key, slug] of Object.entries(before)) assert.equal(after[key], slug, key);
    const manifest = JSON.parse(readFileSync(path.join(f.data, 'lemmata.json'), 'utf8'));
    assert.equal(manifest['xwri/on'].slug, 'chorion-2');
    assert.ok(existsSync(path.join(f.data, 'lemmata', 'chorion-2.json')));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('a new key never takes a recorded slug, even one whose key has no page now', () => {
  // xo/rion held chorion-2 once and has fallen below the page threshold.
  const f = fixture({ 'xo/ri^on': 'chorion', 'xo/rion': 'chorion-2' });
  try {
    addWork(f.data, 'A', { 'xo/ri^on': 5, 'xwri/on': 30, 'xo/rion': 1 });
    const r = run(f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(slugsOf(f.data), { 'xwri/on': 'chorion-3', 'xo/ri^on': 'chorion' });
    // The record keeps the retired slug and gains the new one.
    assert.deepEqual(JSON.parse(readFileSync(f.rec, 'utf8')),
      { 'xo/ri^on': 'chorion', 'xo/rion': 'chorion-2', 'xwri/on': 'chorion-3' });
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('refuses to run without the slug record', () => {
  const f = fixture(undefined);
  try {
    addWork(f.data, 'A', { 'xo/ri^on': 5 });
    const r = run(f);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /slug record/);
    assert.ok(!existsSync(path.join(f.data, 'lemmata')), 'wrote pages without a record');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('refuses a record that gives one slug to two keys', () => {
  const f = fixture({ 'xo/ri^on': 'chorion', 'xwri/on': 'chorion' });
  try {
    addWork(f.data, 'A', { 'xo/ri^on': 5 });
    const r = run(f);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /chorion/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
