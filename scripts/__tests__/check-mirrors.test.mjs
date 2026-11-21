// node --test "scripts/__tests__/check-mirrors.test.mjs"
// scripts/check-mirrors.mjs: is every mirror in mirrors.json whole and current?
// Real git repos and a real http host, all on this machine. Failing cases first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { checkMirrors, readMirrors } from '../check-mirrors.mjs';

const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV }).trim();
const sha = (body) => createHash('sha256').update(body).digest('hex');

// A source repo and a mirror of it.
function repos() {
  const dir = mkdtempSync(path.join(tmpdir(), 'check-mirrors-'));
  const src = path.join(dir, 'src'), mirror = path.join(dir, 'mirror.git');
  git(dir, 'init', '-q', '-b', 'main', src);
  git(src, 'config', 'user.email', 't@example.invalid');
  git(src, 'config', 'user.name', 't');
  const commit = (name) => { writeFileSync(path.join(src, name), name); git(src, 'add', name); git(src, 'commit', '-q', '-m', name); };
  commit('a');
  git(src, 'tag', 'deploy/2026-11-21');
  git(dir, 'clone', '-q', '--bare', src, mirror);
  return { dir, src, mirror, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

// The release's files, its list, and a host that serves both under `base`.
const FILES = () => ({ 'index.html': '<h1>home</h1>', '404.html': '<h1>not here</h1>', 'sw.js': 'self.x = 1;', 'data/Cat/book-01.json': '{"a":1}' });
const sumsOf = (files) => Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, body]) => `${sha(body)}  ${p}\n`).join('');
const TYPES = { html: 'text/html', js: 'text/javascript', json: 'application/json' };
async function site(files, { list = sumsOf(files), base = '/' } = {}) {
  const server = createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p.startsWith(base) ? p.slice(base.length) : null;
    const send = (status, body, type) => { res.writeHead(status, { 'content-type': type }); res.end(body); };
    if (rel === null) return send(404, 'off base', 'text/plain');
    if (rel === 'SHA256SUMS' && list !== null) return send(200, list, 'text/plain');
    if (rel in files) return send(200, files[rel], TYPES[rel.split('.').pop()] || 'application/octet-stream');
    if ((rel === '' || rel.endsWith('/')) && `${rel}index.html` in files) return send(200, files[`${rel}index.html`], TYPES.html);
    return send(404, files['404.html'], TYPES.html);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}${base}`, close: () => new Promise((r) => server.close(r)) };
}

const check = (mirrors, r, over = {}) => checkMirrors({ mirrors: { git: [], site: [], ...mirrors }, source: r?.src, sums: sumsOf(FILES()), tries: 1, ...over });
const said = (result, pattern) => result.results.some((m) => m.problems.some((p) => pattern.test(p)));

test('check-mirrors: a list with no mirror fails: it examined nothing', async () => {
  const r = await check({});
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /names no mirror: examined nothing/);
});

test('check-mirrors: a git mirror behind the source fails, and the ref is named', async () => {
  const r = repos();
  try {
    r.commit('b');
    const out = await check({ git: [{ name: 'Second', url: r.mirror }] }, r);
    assert.equal(out.ok, false);
    assert.ok(said(out, /differs: refs\/heads\/main/), JSON.stringify(out.results));
    assert.equal(out.results[0].name, 'Second');
  } finally { r.done(); }
});

test('check-mirrors: a git mirror that lacks a tag fails', async () => {
  const r = repos();
  try {
    git(r.src, 'tag', 'deploy/2026-11-22');
    const out = await check({ git: [{ name: 'Second', url: r.mirror }] }, r);
    assert.equal(out.ok, false);
    assert.ok(said(out, /missing on the mirror: refs\/tags\/deploy\/2026-11-22/));
  } finally { r.done(); }
});

test('check-mirrors: a git mirror that cannot be read is silent, and fails', async () => {
  const r = repos();
  try {
    const out = await check({ git: [{ name: 'Gone', url: path.join(r.dir, 'gone.git') }] }, r);
    assert.equal(out.ok, false);
    assert.ok(said(out, /silent: could not read/), JSON.stringify(out.results));
  } finally { r.done(); }
});

test('check-mirrors: a shallow git mirror with the right tips fails', async () => {
  const r = repos();
  try {
    r.commit('b');
    const shallow = path.join(r.dir, 'shallow.git');
    git(r.dir, 'clone', '-q', '--bare', '--depth', '1', `file://${r.src}`, shallow);
    git(shallow, 'fetch', '-q', '--depth', '1', `file://${r.src}`, 'refs/tags/*:refs/tags/*');
    const out = await check({ git: [{ name: 'Shallow', url: shallow }] }, r);
    assert.equal(out.ok, false);
    assert.ok(said(out, /shallow|not whole/), JSON.stringify(out.results));
  } finally { r.done(); }
});

test('check-mirrors: a site mirror that serves another release\'s list is stale, and fails', async () => {
  const old = { ...FILES(), 'sw.js': 'self.x = 0;' };
  const s = await site(old);
  try {
    const out = await check({ site: [{ name: 'Old', url: s.url }] });
    assert.equal(out.ok, false);
    assert.ok(said(out, /stale: its SHA256SUMS is not the release's/), JSON.stringify(out.results));
  } finally { await s.close(); }
});

test('check-mirrors: a site mirror that does not answer is silent, and fails', async () => {
  const out = await check({ site: [{ name: 'Gone', url: 'http://127.0.0.1:9/' }] });
  assert.equal(out.ok, false);
  assert.ok(said(out, /silent: /), JSON.stringify(out.results));
});

test('check-mirrors: a site mirror with no SHA256SUMS fails', async () => {
  const s = await site(FILES(), { list: null });
  try {
    const out = await check({ site: [{ name: 'Bare', url: s.url }] });
    assert.equal(out.ok, false);
    assert.ok(said(out, /SHA256SUMS answered 404/), JSON.stringify(out.results));
  } finally { await s.close(); }
});

test('check-mirrors: a site mirror with the release\'s list and one changed file fails', async () => {
  const s = await site({ ...FILES(), 'data/Cat/book-01.json': '{"a":2}' }, { list: sumsOf(FILES()) });
  try {
    const out = await check({ site: [{ name: 'Bent', url: s.url }] });
    assert.equal(out.ok, false);
    assert.ok(said(out, /data\/Cat\/book-01\.json: the bytes served are not the listed ones/), JSON.stringify(out.results));
  } finally { await s.close(); }
});

test('check-mirrors: one bad mirror fails the run and does not hide a good one', async () => {
  const r = repos();
  const s = await site(FILES());
  try {
    const out = await check({ git: [{ name: 'Good', url: r.mirror }, { name: 'Gone', url: path.join(r.dir, 'gone.git') }], site: [{ name: 'Site', url: s.url }] }, r);
    assert.equal(out.ok, false);
    assert.deepEqual(out.results.map((m) => [m.kind, m.name, m.ok]), [['git', 'Good', true], ['git', 'Gone', false], ['site', 'Site', true]]);
  } finally { await s.close(); r.done(); }
});

test('check-mirrors: a whole git mirror and a current site mirror pass, and each says what was read', async () => {
  const r = repos();
  const s = await site(FILES(), { base: '/aristotle/' });
  try {
    const out = await check({ git: [{ name: 'Second', url: r.mirror }], site: [{ name: 'Site', url: s.url }] }, r);
    assert.deepEqual(out.problems, []);
    assert.equal(out.ok, true, JSON.stringify(out.results));
    assert.match(out.results[0].note, /2 of 2 refs match; history: 1 commits, whole/);
    assert.match(out.results[1].note, /serves the release's SHA256SUMS; 4 of 4 listed files asked for/);
  } finally { await s.close(); r.done(); }
});

test('check-mirrors: a git mirror with no source to hold it to fails', async () => {
  const r = repos();
  try {
    const out = await checkMirrors({ mirrors: { git: [{ name: 'Second', url: r.mirror }], site: [] }, sums: sumsOf(FILES()) });
    assert.equal(out.ok, false);
    assert.match(out.problems.join('\n'), /--source/);
  } finally { r.done(); }
});

test('check-mirrors: a site mirror with no release list to hold it to fails', async () => {
  const s = await site(FILES());
  try {
    const out = await checkMirrors({ mirrors: { git: [], site: [{ name: 'Site', url: s.url }] } });
    assert.equal(out.ok, false);
    assert.match(out.problems.join('\n'), /--sums/);
  } finally { await s.close(); }
});

test('readMirrors: the file\'s shape is held to', () => {
  assert.deepEqual(readMirrors('{"git":[],"site":[]}'), { git: [], site: [] });
  const one = '{"git":[{"name":"GitLab","url":"https://gitlab.com/a/b.git"}],"site":[{"name":"Second","url":"https://second.example/"}]}';
  assert.equal(readMirrors(one).git[0].name, 'GitLab');
  for (const bad of [
    '{}', '{"git":[]}', '{"git":{},"site":[]}', '{"git":[],"site":[],"extra":[]}',
    '{"git":[{"name":"x"}],"site":[]}', '{"git":[{"url":"https://gitlab.com/a/b.git"}],"site":[]}',
    '{"git":[{"name":"x","url":"https://gitlab.com/a/b.git","note":1}],"site":[]}',
    '{"git":[],"site":[{"name":"x","url":"second.example"}]}', '{"git":[],"site":[{"name":"x","url":"ftp://second.example/"}]}',
    '{"git":[],"site":[{"name":"x","url":"https://second.example/?a=1"}]}',
    '{"git":[{"name":"a","url":"https://gitlab.com/a/b.git"},{"name":"b","url":"https://gitlab.com/a/b.git"}],"site":[]}',
    '{"git":[{"name":"x","url":"https://u:secret@gitlab.com/a/b.git"}],"site":[]}',
    'not json',
  ]) assert.throws(() => readMirrors(bad), /mirrors\.json/, bad);
});

test('the repo\'s own mirrors.json reads', async () => {
  const { readFileSync } = await import('node:fs');
  const m = readMirrors(readFileSync(new URL('../../mirrors.json', import.meta.url), 'utf8'));
  assert.ok(Array.isArray(m.git) && Array.isArray(m.site));
});
