// node --test scripts/__tests__/
// The pure functions of scripts/deploy-cloudflare.mjs. No build, no network:
// importing the script does not run its main().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  CACHE_CONTROL, DATA_ROOT, builtDataRoot, headUrl, contentTypeFor, countSitemapPages, groupByContentType,
  parseArgs, planUploads, remoteOnlyKeys, tagCommits, tagDeploy, tagPlan, uncleanFiles,
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
const plan = (over = {}) => tagPlan({ unclean: [], noTag: false, head: HEAD, tags: new Map(), date: '2026-11-21', ...over });

test('tagPlan: a deploy from a tree with changed or untracked files is not tagged, and the files are named', () => {
  const p = plan({ unclean: ['app/src/pages/new.astro'] });
  assert.equal(p.tag, undefined);
  assert.match(p.skip, /app\/src\/pages\/new\.astro/);
  assert.match(plan({ unclean: ['a', 'b', 'c', 'd', 'e'] }).skip, /a, b, c, and 2 more/);
});

test('tagPlan: --no-tag is not tagged, and says so', () => {
  const p = plan({ noTag: true });
  assert.equal(p.tag, undefined);
  assert.match(p.skip, /--no-tag/);
  assert.equal(parseArgs(['--no-tag']).noTag, true);
  assert.equal(parseArgs([]).noTag, false);
});

test('tagPlan: a commit that already has a deploy tag on origin gets no second one', () => {
  const p = plan({ tags: new Map([['deploy/2026-11-20', HEAD]]) });
  assert.equal(p.tag, undefined);
  assert.match(p.skip, /deploy\/2026-11-20/);
  // A tag of another kind at this commit is no deploy tag.
  assert.deepEqual(plan({ tags: new Map([['v1', HEAD]]) }), { tag: 'deploy/2026-11-21' });
});

test('tagPlan: a date that is not a date is refused', () => {
  for (const date of ['', '21 Nov', '2026-11-21 ', '2026-11-21\nx']) {
    assert.throws(() => plan({ date }), /date/, JSON.stringify(date));
  }
});

test('tagPlan: the first deploy of a day is deploy/<date>; later ones go one past the highest number, here or on origin', () => {
  const on = (tags, local) => plan({ tags: new Map(tags), local });
  assert.deepEqual(on([]), { tag: 'deploy/2026-11-21' });
  assert.deepEqual(on([['deploy/2026-11-20', OTHER]]), { tag: 'deploy/2026-11-21' });
  assert.deepEqual(on([['deploy/2026-11-21', OTHER]]), { tag: 'deploy/2026-11-21.2' });
  assert.deepEqual(on([['deploy/2026-11-21', OTHER], ['deploy/2026-11-21.2', OTHER]]), { tag: 'deploy/2026-11-21.3' });
  // A gap is not filled: .2 is gone, .3 exists, the next is .4.
  assert.deepEqual(on([['deploy/2026-11-21', OTHER], ['deploy/2026-11-21.3', OTHER]]), { tag: 'deploy/2026-11-21.4' });
  // A name this checkout holds and origin does not is not given out again.
  assert.deepEqual(on([['deploy/2026-11-21', OTHER]], ['deploy/2026-11-21.2']), { tag: 'deploy/2026-11-21.3' });
  assert.deepEqual(on([], ['deploy/2026-11-21']), { tag: 'deploy/2026-11-21.2' });
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
  const deploy = (head, over = {}) => tagDeploy({ cwd: work, head, unclean: [], noTag: false, date: '2026-11-21', ...over });
  return { git, origin, work, commit, deploy, done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('tagDeploy: an origin that cannot be read throws, and no tag is left here', () => {
  const c = checkout();
  try {
    const head = c.commit();
    c.git(c.work, 'remote', 'set-url', 'origin', path.join(c.work, 'nowhere.git'));
    assert.throws(() => c.deploy(head), /git ls-remote/);
    assert.equal(c.git(c.work, 'tag', '--list'), '');
  } finally { c.done(); }
});

test('tagDeploy: an origin that refuses the tag throws, and the tag is not left here to block the next try', () => {
  const c = checkout();
  try {
    const head = c.commit();
    const hook = path.join(c.origin, 'hooks', 'pre-receive');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.throws(() => c.deploy(head), /git push/);
    assert.equal(c.git(c.work, 'tag', '--list'), '');
    rmSync(hook);
    assert.deepEqual(c.deploy(head), { tag: 'deploy/2026-11-21' });
    assert.equal(c.git(c.origin, 'rev-parse', 'refs/tags/deploy/2026-11-21'), head);
  } finally { c.done(); }
});

test('tagDeploy: an unclean tree or --no-tag tags nothing, here or on origin, and asks origin nothing', () => {
  const c = checkout();
  try {
    const head = c.commit();
    c.git(c.work, 'remote', 'set-url', 'origin', path.join(c.work, 'nowhere.git'));   // a read of origin would throw
    assert.match(c.deploy(head, { unclean: ['x.astro'] }).skip, /x\.astro/);
    assert.match(c.deploy(head, { noTag: true }).skip, /--no-tag/);
    assert.equal(c.git(c.work, 'tag', '--list'), '');
    assert.equal(c.git(c.origin, 'tag', '--list'), '');
  } finally { c.done(); }
});

test('tagDeploy: the tag lands on origin at the deployed commit; a name used on origin alone is not used again', () => {
  const c = checkout();
  try {
    const first = c.commit();
    assert.deepEqual(c.deploy(first), { tag: 'deploy/2026-11-21' });
    assert.equal(c.git(c.origin, 'rev-parse', 'refs/tags/deploy/2026-11-21'), first);
    // The same commit deployed again: no second tag.
    assert.match(c.deploy(first).skip, /already tagged deploy\/2026-11-21/);
    // Another machine tagged .2 on origin, annotated; this checkout has never seen it.
    const second = c.commit();
    c.git(c.origin, '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'tag', '-a', 'deploy/2026-11-21.2', '-m', 'elsewhere', second);
    assert.match(c.deploy(second).skip, /already tagged deploy\/2026-11-21\.2/);   // the annotated tag's commit, not its own object
    const third = c.commit();
    assert.deepEqual(c.deploy(third), { tag: 'deploy/2026-11-21.3' });
    assert.equal(c.git(c.origin, 'rev-parse', 'refs/tags/deploy/2026-11-21.3'), third);
    assert.equal(c.git(c.work, 'tag', '--list', 'deploy/2026-11-21.2'), '');   // reading origin wrote nothing here
  } finally { c.done(); }
});

test('tagDeploy: a local tag of another name that differs from origin\'s does not stand in the way', () => {
  const c = checkout();
  try {
    const first = c.commit();
    c.git(c.origin, 'tag', 'v1', first);
    const second = c.commit();
    c.git(c.work, 'tag', 'v1', second);
    assert.deepEqual(c.deploy(second), { tag: 'deploy/2026-11-21' });
  } finally { c.done(); }
});

test('tagCommits: a plain tag gives its commit, an annotated one the commit it names', () => {
  const tags = tagCommits(`${'c'.repeat(40)}\trefs/tags/deploy/a\n${'d'.repeat(40)}\trefs/tags/deploy/b\n${'e'.repeat(40)}\trefs/tags/deploy/b^{}\n`);
  assert.deepEqual([...tags], [['deploy/a', 'c'.repeat(40)], ['deploy/b', 'e'.repeat(40)]]);
  assert.equal(tagCommits('').size, 0);
});

test('uncleanFiles: an untracked page counts even where git is set to hide untracked files; ignored build output does not', () => {
  // Codex's review of the Plato port.
  const c = checkout();
  try {
    c.commit();
    writeFileSync(path.join(c.work, '.gitignore'), 'build/\n');
    c.git(c.work, 'add', '.gitignore');
    c.git(c.work, 'commit', '-q', '-m', 'ignore');
    assert.deepEqual(uncleanFiles(c.work), []);
    mkdirSync(path.join(c.work, 'build'));
    mkdirSync(path.join(c.work, 'pages'));
    writeFileSync(path.join(c.work, 'build', 'out.json'), '{}');
    assert.deepEqual(uncleanFiles(c.work), [], 'git-ignored build output');
    c.git(c.work, 'config', 'status.showUntrackedFiles', 'no');
    writeFileSync(path.join(c.work, 'pages', 'new.astro'), 'x');
    assert.deepEqual(uncleanFiles(c.work), ['pages/new.astro']);
    writeFileSync(path.join(c.work, '.gitignore'), 'build/\nmore/\n');
    assert.deepEqual(uncleanFiles(c.work).sort(), ['.gitignore', 'pages/new.astro']);
  } finally { c.done(); }
});
