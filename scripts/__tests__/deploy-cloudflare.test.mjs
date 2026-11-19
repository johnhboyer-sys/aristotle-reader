// node --test scripts/__tests__/
// The pure functions of scripts/deploy-cloudflare.mjs. No build, no network:
// importing the script does not run its main().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CACHE_CONTROL, DATA_ROOT, builtDataRoot, contentTypeFor, countSitemapPages, groupByContentType,
  parseArgs, planUploads, remoteOnlyKeys,
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
