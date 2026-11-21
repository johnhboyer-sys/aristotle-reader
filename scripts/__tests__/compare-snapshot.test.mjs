// node --test "scripts/__tests__/compare-snapshot.test.mjs"
// scripts/compare-snapshot.mjs against small trees in a temp folder. The
// failing cases come first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { compare, rename, settlePages, svelteClass } from '../compare-snapshot.mjs';
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

// ---- pages (--pages): Astro's output is not byte-stable across checkouts ----
const OLD = 'svelte-abc123';   // the class the live build gave the component
const PAGE = (bundle, cls, uid, word = 'λόγος') =>
  `<link href="/_astro/${bundle}"><astro-island uid="${uid}"><p class="ck ${cls}">${word}</p></astro-island>`;
const CSS = (cls) => `.ck.${cls}{color:red}`;
const WAS = PAGE('search.AAAAAAAA.css', OLD, 'Z1');
// A snapshot and the same site built in another folder: the component under
// shared/ has another class there (t.cls), so the stylesheet has another
// hash and the island another id. `make` returns what to change:
// { built: {path: body}, live: {path: body}, gone: [build paths] }, given the
// new class and the rebuilt page.
function appTrees(make = () => ({})) {
  const dir = mkdtempSync(path.join(tmpdir(), 'compare-snapshot-'));
  const build = path.join(dir, 'dist'), snap = path.join(dir, 'snap'), shared = path.join(dir, 'shared');
  mkdirSync(shared);
  writeFileSync(path.join(shared, 'Ck.svelte'), '<p class="ck">x</p><style>.ck{color:red}</style>');
  const cls = svelteClass(realpathSync(path.join(shared, 'Ck.svelte')));
  const now = PAGE('search.BBBBBBBB.css', cls, 'Q7');
  const { built = {}, live = {}, gone = [] } = make({ cls, now });
  const builds = { 'index.html': now, 'EN/1/index.html': '<p>same</p>', '_astro/search.BBBBBBBB.css': CSS(cls), 'sw.js': 'sw',
    '_redirects': '/x /y', 'data/EN/book-01.json': '{}', ...built };
  const lives = { 'app/index.html': WAS, 'app/EN/1/index.html': '<p>same</p>', 'app/_astro/search.AAAAAAAA.css': CSS(OLD), 'app/sw.js': 'sw', ...live };
  for (const [p, body] of Object.entries(builds)) { if (gone.includes(p)) continue; mkdirSync(path.join(build, path.dirname(p)), { recursive: true }); writeFileSync(path.join(build, p), body); }
  for (const [p, body] of Object.entries(lives)) { mkdirSync(path.join(snap, path.dirname(p)), { recursive: true }); writeFileSync(path.join(snap, p), body); }
  const sums = path.join(snap, 'SHA256SUMS');
  writeFileSync(sums, formatSums(Object.entries(lives).map(([p, body]) => ({ path: p, sha256: sha(body) }))));
  return { dir, build, snap, sums, shared, cls };
}
const runApp = (t, { skip = '--skip=data/,_redirects', svelte = `--svelte=${t.shared}`, pages = `--pages=${t.snap}` } = {}) =>
  spawnSync(process.execPath, [SCRIPT, `--sums=${t.sums}`, '--prefix=app/', `--build=${t.build}`, pages, svelte, skip].filter(Boolean), { encoding: 'utf8' });
const fails = (t, pattern, options) => {
  try {
    const r = runApp(t, options);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, pattern);
    return r.stdout;
  } finally { clean(t); }
};
// The same words added to the page on both sides: `was` in the snapshot, `is` in the build.
const both = (was, is) => appTrees(({ cls, now }) => ({ built: { 'index.html': now + is(cls) }, live: { 'app/index.html': WAS + (typeof was === 'function' ? was(cls) : was) } }));

test('pages: a page whose words differ fails', () => {
  fails(appTrees(({ cls }) => ({ built: { 'index.html': PAGE('search.BBBBBBBB.css', cls, 'Q7', 'λόγον') } })), /differs: index\.html/);
});

test('pages: a word that looks like a class is a word: changing it fails, wherever it is', () => {
  const places = [(w) => `<p>the class ${w} is new</p>`, (w) => `<i title="${w}">x</i>`, (w) => `<p class="${w}">x</p>`,
    (w) => `<p>Read docs.${w} today.</p>`, (w) => `<script>const hint="<style>";</script><p>docs.${w}</p>`, (w) => `<style>.${w}{}</style>`];
  for (const say of places) {
    const out = fails(both(say('svelte-a1'), () => say('svelte-b2')), /svelte-a1 -> svelte-b2 is not a rename: svelte-b2 is not the class of a component under --svelte/);
    assert.match(out, /differs: index\.html/);
  }
  // the same change in a renamed bundle's code
  fails(appTrees(({ cls }) => ({ built: { '_astro/search.BBBBBBBB.css': CSS(cls) + '.x:after{content:"svelte-b2"}' }, live: { 'app/_astro/search.AAAAAAAA.css': CSS(OLD) + '.x:after{content:"svelte-a1"}' } })),
    /is not a rename[^]*search\.BBBBBBBB\.css has the stem of _astro\/search\.AAAAAAAA\.css and other contents/);
  // an island id outside an <astro-island> tag, and a class that only ends like one
  fails(both('<p uid="Z1">', () => '<p uid="Q7">'), /differs: index\.html/);
  fails(both(`<p class="custom-${OLD}">`, (cls) => `<p class="custom-${cls}">`), /differs: index\.html/);
  fails(both(`<p class="${OLD}_x">`, (cls) => `<p class="${cls}_x">`), /differs: index\.html/);
});

test('pages: the component\'s new class stands for one old name only', () => {
  // words that held some other name and now hold the component's class
  fails(both('<p>svelte-zzz999</p>', (cls) => `<p>${cls}</p>`), /not swapped one to one: svelte-zzz999 -> svelte-[a-z0-9]+, but svelte-abc123 -> svelte-[a-z0-9]+/);
  // a name is swapped everywhere or nowhere: the old class, kept in one place, fails
  fails(both(`<p>once ${OLD}</p>`, () => `<p>once ${OLD}</p>`), /not swapped one to one: svelte-abc123 -> svelte-abc123, but svelte-abc123 -> svelte-[a-z0-9]+/);
  // two old classes, one new one
  fails(both(`<p class="svelte-ppp000">b</p>`, (cls) => `<p class="${cls}">b</p>`), /not swapped one to one/);
  // one old class, two new ones: only one of them can be the component's
  fails(both(`<p class="${OLD}">b</p>`, () => '<p class="svelte-qqq111">b</p>'), /svelte-abc123 -> svelte-qqq111 is not a rename/);
  // the component's class in the snapshot, another name in its place now: the witness is the new name, not the old
  fails(both((cls) => `<b class="${cls}">`, () => '<b class="svelte-qqq111">'), /svelte-[a-z0-9]+ -> svelte-qqq111 is not a rename/);
  // the new class was already another page's, unchanged: two classes that were apart are now one
  const other = (cls, uid) => `<p class="${cls}">same</p><astro-island uid="${uid}">`;
  fails(appTrees(({ cls }) => ({ built: { 'EN/1/index.html': other(cls, 'K2') }, live: { 'app/EN/1/index.html': other(cls, 'K1') } })), /not swapped one to one/);
});

test('pages: without the components to check against, no Svelte class is taken on trust', () => {
  fails(appTrees(), /svelte-abc123 -> svelte-[a-z0-9]+ is not a rename[^]*differs: index\.html/, { svelte: '' });
  const t = appTrees();
  try {
    const empty = path.join(t.dir, 'empty');
    mkdirSync(empty);
    for (const dir of [empty, path.join(t.dir, 'absent'), `${t.shared},${empty}`]) {
      const r = runApp(t, { svelte: `--svelte=${dir}` });
      assert.equal(r.status, 1, r.stdout);
      assert.match(r.stdout, /--svelte names .*, which holds no \.svelte file/);
    }
  } finally { clean(t); }
});

test('pages: the snapshot folder must hold the files the list names', () => {
  // the build changed a page, and --pages holds a copy that agrees with the build, not with SHA256SUMS
  const t = appTrees(() => ({ built: { 'EN/1/index.html': '<p>changed</p>' } }));
  writeFileSync(path.join(t.snap, 'app/EN/1/index.html'), '<p>changed</p>');
  const out = fails(t, /EN\/1\/index\.html is not the file .*SHA256SUMS lists/);
  assert.match(out, /^FAIL/);
});

test('pages: a bundle\'s new name that the snapshot already used is not a rename', () => {
  const cached = '<script>const cached="/_astro/search.BBBBBBBB.css"</script>';
  fails(both(cached, () => cached), /not swapped one to one: \/search\.AAAAAAAA\.css -> \/search\.BBBBBBBB\.css, but the snapshot names \/search\.BBBBBBBB\.css too/);
});

test('pages: a page that names another stylesheet fails', () => {
  fails(appTrees(({ cls }) => ({ built: { 'index.html': PAGE('search.CCCCCCCC.css', cls, 'Q7') } })), /differs: index\.html/);
  // two plain names that happen to have an eight-letter middle part
  fails(appTrees(({ now }) => ({ built: { 'index.html': now + '<link href="/_astro/logo.modified.css">', '_astro/logo.modified.css': 'b{color:blue}' },
    live: { 'app/index.html': WAS + '<link href="/_astro/logo.original.css">', 'app/_astro/logo.original.css': 'b{color:red}' } })),
  /_astro\/logo\.modified\.css has the stem of _astro\/logo\.original\.css and other contents/);
  // a longer file name that starts with a renamed bundle's is another file
  for (const tail of ['.extra.css', '+extra.css', '-old', '_2', '@2x', '~', '%20x'])
    fails(both(`<link href="/_astro/search.AAAAAAAA.css${tail}">`, () => `<link href="/_astro/search.BBBBBBBB.css${tail}">`), /differs: index\.html/);
  fails(both('<link href="/_astro/xsearch.AAAAAAAA.css">', () => '<link href="/_astro/xsearch.BBBBBBBB.css">'), /differs: index\.html/);
});

test('pages: a renamed bundle with other contents fails and is named', () => {
  const out = fails(appTrees(({ cls }) => ({ built: { '_astro/search.BBBBBBBB.css': CSS(cls) + '.ck{display:none}' } })),
    /search\.BBBBBBBB\.css has the stem of _astro\/search\.AAAAAAAA\.css and other contents/);
  assert.match(out, /0 renamed bundles/);
  assert.match(out, /only in the build: _astro\/search\.BBBBBBBB\.css/);
});

test('pages: a bundle with no partner of its stem on the other side fails, both ways, and two partners are no partner', () => {
  fails(appTrees(() => ({ built: { '_astro/Phrases.DDDDDDDD.js': 'x' } })), /only in the build: _astro\/Phrases\.DDDDDDDD\.js/);
  fails(appTrees(() => ({ gone: ['_astro/search.BBBBBBBB.css'] })), /only in the snapshot: _astro\/search\.AAAAAAAA\.css/);
  fails(appTrees(({ cls }) => ({ built: { '_astro/search.EEEEEEEE.css': CSS(cls) } })), /0 renamed bundles[^]*only in the build: _astro\/search\.BBBBBBBB\.css/);
});

test('pages: a renamed bundle does not excuse a page the build lost', () => {
  const out = fails(appTrees(() => ({ gone: ['EN/1/index.html'] })), /only in the snapshot: EN\/1\/index\.html/);
  assert.match(out, /1 renamed bundles/);
});

test('pages: files are compared as bytes: two that decode to the same broken text still differ', () => {
  const page = (byte) => Buffer.concat([Buffer.from('<p>'), Buffer.from([byte]), Buffer.from('</p>')]);
  fails(appTrees(() => ({ built: { 'EN/1/index.html': page(0x81) }, live: { 'app/EN/1/index.html': page(0x80) } })), /differs: EN\/1\/index\.html/);
});

test('pages: a page with one more class than the snapshot fails, and no swap is guessed from it', () => {
  for (const [was, is] of [['', (cls) => `<b class="${cls}">`], [`<b class="${OLD}">`, () => '']]) {
    const out = fails(both(was, is), /differs: index\.html/);
    assert.doesNotMatch(out, /undefined|one to one|not a rename/);
  }
});

test('pages: without --pages the rebuilt page fails', () => {
  fails(appTrees(), /differs: index\.html/, { pages: '', svelte: '' });
});

test('--skip: an item that matches nothing fails, alone or beside one that matches, and so does an empty item', () => {
  for (const [skip, named] of [['--skip=nothing/', '"nothing/"'], ['--skip=data/,_redirects,nothing/', '"nothing/"'], ['--skip=data/,,_redirects', '""'], ['--skip=', '""'], ['--skip=data', '"data"']]) {
    const out = fails(appTrees(), /--skip names/, { skip });
    assert.ok(out.includes(`--skip names ${named}, which matches nothing`), skip + out);
  }
});

test('pages: the same site built in another folder passes, and the output says which names were swapped', () => {
  const t = appTrees();
  try {
    const r = runApp(t);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ok .*2 of 4 build files are byte for byte .*; 1 pages and 1 renamed bundles equal once 3 names are swapped \(Svelte classes checked against 1 component path\); 0 differ, 0 only in the build, 0 only in the snapshot/);
    for (const line of ['swapped: /search.AAAAAAAA.css -> /search.BBBBBBBB.css', `swapped: ${OLD} -> ${t.cls}`, 'swapped: <astro-island uid="Z1" -> <astro-island uid="Q7"']) assert.ok(r.stdout.includes(line), r.stdout);
  } finally { clean(t); }
});

test('svelteClass is Svelte\'s own hash of the path', () => {
  // from svelte 5.56.3's `hash` (svelte/src/utils.js), run on these two strings
  assert.equal(svelteClass('/repo/shared/components/Search.svelte'), 'svelte-1g3q2xp');
  assert.equal(svelteClass('/home/runner/work/reader/reader/shared/components/WordPopup.svelte'), 'svelte-16i7i5p');
});

test('rename: whole names only, each once', () => {
  const swaps = new Map([['svelte-a1', 'svelte-b2'], ['svelte-b2', 'svelte-a1'], ['/x.AAAAAAAA.js', '/x.BBBBBBBB.js'], ['<astro-island uid="Z1"', '<astro-island uid="Q7"']]);
  assert.equal(rename('svelte-a1 .svelte-b2{} svelte-a1b svelte-a1-c x-svelte-a1 svelte-a1_', swaps), 'svelte-b2 .svelte-a1{} svelte-a1b svelte-a1-c x-svelte-a1 svelte-a1_');
  assert.equal(rename('"/_astro/x.AAAAAAAA.js" import"./x.AAAAAAAA.js" url(/x.AAAAAAAA.js) /x.AAAAAAAA.js?v=1 /x.AAAAAAAA.js', swaps),
    '"/_astro/x.BBBBBBBB.js" import"./x.BBBBBBBB.js" url(/x.BBBBBBBB.js) /x.BBBBBBBB.js?v=1 /x.BBBBBBBB.js');
  assert.equal(rename('x.AAAAAAAA.js /x.AAAAAAAA.json /x.AAAAAAAA.js.map /x.AAAAAAAA.js+ /yx.AAAAAAAA.js', swaps), 'x.AAAAAAAA.js /x.AAAAAAAA.json /x.AAAAAAAA.js.map /x.AAAAAAAA.js+ /yx.AAAAAAAA.js');
  assert.equal(rename('<astro-island uid="Z1"> <astro-island uid="Z12"> <p uid="Z1">', swaps), '<astro-island uid="Q7"> <astro-island uid="Z12"> <p uid="Z1">');
  assert.equal(rename('a.b', new Map()), 'a.b');
  const r = settlePages({ differ: ['a.json'], onlyBuild: [], onlySnapshot: [], problems: [] }, () => 'x', () => 'x');
  assert.deepEqual([r.differ, r.swappedPages, r.ok], [['a.json'], [], false]);   // only pages are read
});
