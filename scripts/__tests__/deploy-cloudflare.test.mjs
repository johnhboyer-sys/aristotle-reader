// node --test scripts/__tests__/
// The pure functions of scripts/deploy-cloudflare.mjs. No build, no network:
// importing the script does not run its main().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CACHE_CONTROL, DATA_ROOT, builtDataRoot, headUrl, contentTypeFor, countSitemapPages, groupByContentType,
  parseArgs, parseTagList, planUploads, remoteOnlyKeys, tagDeploy, tagPlan, TAG_FORMAT,
} from '../deploy-cloudflare.mjs';

test('parseArgs: defaults, flags, trailing slashes, and refusals', () => {
  const d = parseArgs([]);
  assert.equal(d.dryRun, false);
  assert.equal(d.dataRoot, DATA_ROOT);
  const o = parseArgs(['--dry-run', '--data-root=https://x.example/', '--site=https://s.example/', '--min-pages-ratio=0.5']);
  assert.deepEqual([o.dryRun, o.dataRoot, o.site, o.minPagesRatio], [true, 'https://x.example', 'https://s.example', 0.5]);
  assert.throws(() => parseArgs(['--dist=/tmp/x']), /unknown/);
  assert.throws(() => parseArgs(['--min-pages-ratio=abc']), /unknown/);
});

test('builtDataRoot reads what postbuild-data-root.mjs writes, and the unbuilt source', () => {
  assert.equal(builtDataRoot(`x\nconst DATA_ROOT = "${DATA_ROOT}";\ny`), DATA_ROOT);
  assert.equal(builtDataRoot(readFileSync(new URL('../../app/public/sw.js', import.meta.url), 'utf8')), '');
  assert.equal(builtDataRoot('no root here'), null);
  assert.equal(builtDataRoot(`const DATA_ROOT = "${DATA_ROOT}/";`), DATA_ROOT);
});

test('headUrl adds a query the data hostname has not cached', () => {
  assert.equal(headUrl(DATA_ROOT, 'EN/book-01.json', 'abc'), `${DATA_ROOT}/EN/book-01.json?readback=abc`);
});

test('contentTypeFor knows the three data types and nothing else', () => {
  assert.equal(contentTypeFor('EN/book-01.json'), 'application/json; charset=utf-8');
  assert.equal(contentTypeFor('reports/quality_APo.md'), 'text/markdown; charset=utf-8');
  assert.equal(contentTypeFor('APo/search/grammar-col.bin'), 'application/octet-stream');
  assert.equal(contentTypeFor('x/notes.txt'), null);
});

test('countSitemapPages counts <loc> entries', () => {
  assert.equal(countSitemapPages('<urlset><url><loc>a</loc></url><url><loc>b</loc></url></urlset>'), 2);
  assert.equal(countSitemapPages(''), 0);
});

test('planUploads: new, changed, multipart and mis-labelled objects upload; matching ones do not', () => {
  const ok = (etag, key = 'x.json') => ({ etag, type: contentTypeFor(key), cacheControl: CACHE_CONTROL });
  const local = [
    { key: 'same.json', md5: 'aaa' },
    { key: 'changed.json', md5: 'bbb' },
    { key: 'new.json', md5: 'ccc' },
    { key: 'multipart.json', md5: 'ddd' },
    { key: 'wrongtype.json', md5: 'eee' },
    { key: 'wrongcache.md', md5: 'fff' },
  ];
  const remote = new Map([
    ['same.json', ok('aaa')],
    ['changed.json', ok('old')],
    ['multipart.json', ok('ddd-2')],
    ['wrongtype.json', { ...ok('eee'), type: 'application/octet-stream' }],
    ['wrongcache.md', { ...ok('fff', 'x.md'), cacheControl: 'max-age=0' }],
  ]);
  assert.deepEqual(planUploads(local, remote).map((f) => f.key),
    ['changed.json', 'new.json', 'multipart.json', 'wrongtype.json', 'wrongcache.md']);
});

test('remoteOnlyKeys: what the bucket record has and the build lacks', () => {
  assert.deepEqual(remoteOnlyKeys(['a.json', 'gone.json', 'b.md'], ['a.json', 'b.md', 'new.json']), ['gone.json']);
  assert.deepEqual(remoteOnlyKeys([], ['a.json']), []);
});

test('groupByContentType splits by type', () => {
  const groups = groupByContentType([{ key: 'a.json' }, { key: 'b.md' }, { key: 'c.json' }]);
  assert.deepEqual([...groups.values()].map((g) => g.map((f) => f.key)), [['a.json', 'c.json'], ['b.md']]);
});

// The deploy's tag (HANDOFF-PORTABILITY.md, phase 3). The cases that must not tag come first.
const HEAD = 'a'.repeat(40), OTHER = 'b'.repeat(40);
test('tagPlan: a deploy from a tree with uncommitted changes is not tagged', () => {
  const plan = tagPlan({ dirty: true, noTag: false, head: HEAD, tags: new Map(), date: '2026-11-21' });
  assert.equal(plan.tag, undefined);
  assert.match(plan.skip, /uncommitted/);
});

test('tagPlan: --no-tag is not tagged, and says so', () => {
  const plan = tagPlan({ dirty: false, noTag: true, head: HEAD, tags: new Map(), date: '2026-11-21' });
  assert.equal(plan.tag, undefined);
  assert.match(plan.skip, /--no-tag/);
  assert.equal(parseArgs(['--no-tag']).noTag, true);
  assert.equal(parseArgs([]).noTag, false);
});

test('tagPlan: a commit that already has a deploy tag gets no second one', () => {
  const plan = tagPlan({ dirty: false, noTag: false, head: HEAD, tags: new Map([['deploy/2026-11-20', HEAD]]), date: '2026-11-21' });
  assert.equal(plan.tag, undefined);
  assert.match(plan.skip, /deploy\/2026-11-20/);
});

test('tagPlan: a date that is not a date is refused', () => {
  for (const date of ['', '21 Nov', '2026-11-21 ', '2026-11-21\nx']) {
    assert.throws(() => tagPlan({ dirty: false, noTag: false, head: HEAD, tags: new Map(), date }), /date/, JSON.stringify(date));
  }
});

test('tagPlan: the first deploy of a day is deploy/<date>; later ones count up and never reuse a name', () => {
  const plan = (tags) => tagPlan({ dirty: false, noTag: false, head: HEAD, tags: new Map(tags), date: '2026-11-21' });
  assert.deepEqual(plan([]), { tag: 'deploy/2026-11-21' });
  assert.deepEqual(plan([['deploy/2026-11-20', OTHER], ['v1', HEAD]]), { tag: 'deploy/2026-11-21' });
  assert.deepEqual(plan([['deploy/2026-11-21', OTHER]]), { tag: 'deploy/2026-11-21.2' });
  assert.deepEqual(plan([['deploy/2026-11-21', OTHER], ['deploy/2026-11-21.2', OTHER]]), { tag: 'deploy/2026-11-21.3' });
  // A gap is not filled: .2 was deleted, .3 exists, the next is .4.
  assert.deepEqual(plan([['deploy/2026-11-21', OTHER], ['deploy/2026-11-21.3', OTHER]]), { tag: 'deploy/2026-11-21.4' });
});

test('parseTagList: a plain tag and an annotated one both give the commit, from real git output', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-tags-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } }).trim();
  try {
    git('init', '-q', '-b', 'main');
    git('-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'a');
    const commit = git('rev-parse', 'HEAD');
    git('tag', 'deploy/2026-11-20');
    git('-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'tag', '-a', 'deploy/2026-11-21', '-m', 'annotated');
    const tags = parseTagList(git('for-each-ref', `--format=${TAG_FORMAT}`, 'refs/tags'));
    assert.deepEqual([...tags], [['deploy/2026-11-20', commit], ['deploy/2026-11-21', commit]]);
    assert.match(tagPlan({ dirty: false, noTag: false, head: commit, tags, date: '2026-11-22' }).skip, /already tagged/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(parseTagList('').size, 0);
});

// tagDeploy against a real checkout with a bare origin beside it.
function checkout() {
  const dir = mkdtempSync(path.join(tmpdir(), 'deploy-tag-'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env }).trim();
  const origin = path.join(dir, 'origin.git'), work = path.join(dir, 'work');
  git(dir, 'init', '-q', '--bare', origin);
  git(dir, 'init', '-q', '-b', 'main', work);
  git(work, 'config', 'user.email', 't@example.invalid');
  git(work, 'config', 'user.name', 't');
  git(work, 'remote', 'add', 'origin', origin);
  const commit = () => { git(work, 'commit', '-q', '--allow-empty', '-m', 'c'); git(work, 'push', '-q', 'origin', 'main'); return git(work, 'rev-parse', 'HEAD'); };
  return { git, origin, work, commit, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('tagDeploy: no origin to push to throws, and leaves no tag behind that says it was pushed', () => {
  const c = checkout();
  try {
    const head = c.commit();
    c.git(c.work, 'remote', 'set-url', 'origin', path.join(c.work, 'nowhere.git'));
    assert.throws(() => tagDeploy({ cwd: c.work, head, dirty: false, noTag: false, date: '2026-11-21' }), /git fetch/);
    assert.equal(c.git(c.work, 'tag', '--list'), '');
  } finally { c.done(); }
});

test('tagDeploy: a dirty tree tags nothing, here or on origin', () => {
  const c = checkout();
  try {
    const head = c.commit();
    assert.match(tagDeploy({ cwd: c.work, head, dirty: true, noTag: false, date: '2026-11-21' }).skip, /uncommitted/);
    assert.equal(c.git(c.work, 'tag', '--list'), '');
    assert.equal(c.git(c.origin, 'tag', '--list'), '');
  } finally { c.done(); }
});

test('tagDeploy: the tag lands on origin at the deployed commit; a name used on origin alone is not used again', () => {
  const c = checkout();
  try {
    const first = c.commit();
    assert.deepEqual(tagDeploy({ cwd: c.work, head: first, dirty: false, noTag: false, date: '2026-11-21' }), { tag: 'deploy/2026-11-21' });
    assert.equal(c.git(c.origin, 'rev-parse', 'refs/tags/deploy/2026-11-21'), first);
    // The same commit deployed again: no second tag.
    assert.match(tagDeploy({ cwd: c.work, head: first, dirty: false, noTag: false, date: '2026-11-21' }).skip, /already tagged deploy\/2026-11-21/);
    // Another machine tagged .2 on origin; this checkout has never seen it.
    const second = c.commit();
    c.git(c.origin, 'tag', 'deploy/2026-11-21.2', first);
    const third = c.commit();
    assert.deepEqual(tagDeploy({ cwd: c.work, head: third, dirty: false, noTag: false, date: '2026-11-21' }), { tag: 'deploy/2026-11-21.3' });
    assert.equal(c.git(c.origin, 'rev-parse', 'refs/tags/deploy/2026-11-21.3'), third);
    assert.notEqual(second, third);
  } finally { c.done(); }
});
