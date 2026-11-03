// node --test scripts/__tests__/
// Exercises the pure functions of scripts/deploy-gh-pages.mjs. No clone, no
// dist, no network: importing the script does not run its main().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  KNOWN_BENIGN,
  LEAK_NAMES,
  auditDataDeletions,
  bundleChanges,
  categorize,
  checkBundleReferences,
  commitMessage,
  findDanglingReferences,
  formatCategoryReport,
  groupByCategory,
  isReferenceSource,
  parseArgs,
  parseDataPrefixes,
  parseNameStatus,
  parseRsyncItemized,
  scanForLeaks,
  scanGatedSlots,
  scanSearchShards,
  scanTranslationIndexes,
  shardName,
  auditDistScale,
  verificationTargets,
  verifyLive,
} from '../deploy-gh-pages.mjs';

// -- rsync itemized output --------------------------------------------------

const RSYNC_DRY_RUN = [
  '.d..t...... ./',
  '>f.st...... index.html',
  '>f+++++++++ data/lsj-heads.json',
  'cd+++++++++ lemma/korse/',
  '>f+++++++++ lemma/korse/index.html',
  '>f.st...... _astro/Reader.DEnkf2zT.js',
  '.f..t...... sw.js',
  '*deleting   _astro/Reader.DZMUvdM2.js',
  '*deleting   data/reports/quality_EN.json',
  '*deleting   data/reports/quality_Meta.json',
  '*deleting   data/Meta/quotations.json',
  '*deleting   lemma/syzeo/index.html',
  '*deleting   lemma/syzeo/',
  '*deleting   data/APo/third-titles.json',
  '',
].join('\n');

test('parseRsyncItemized separates deletions, additions and modifications', () => {
  const r = parseRsyncItemized(RSYNC_DRY_RUN);
  assert.deepEqual(r.added, ['data/lsj-heads.json', 'lemma/korse/index.html']);
  assert.deepEqual(r.modified, ['index.html', '_astro/Reader.DEnkf2zT.js']);
  assert.deepEqual(r.other, ['sw.js']);
  assert.deepEqual(r.deleted, [
    '_astro/Reader.DZMUvdM2.js',
    'data/reports/quality_EN.json',
    'data/reports/quality_Meta.json',
    'data/Meta/quotations.json',
    'lemma/syzeo/index.html',
    'lemma/syzeo',
    'data/APo/third-titles.json',
  ]);
});

// -- deletion categorisation -------------------------------------------------

test('categorize files each path under the category DEPLOY-STATUS.md reads them by', () => {
  assert.equal(categorize('_astro/global.CzLKCRk8.css'), '_astro');
  assert.equal(categorize('data/reports/quality_EN.json'), 'data/reports');
  assert.equal(categorize('data/Meta/quotations.json'), 'data/Meta');
  assert.equal(categorize('data/EN/book-01.json'), 'data/EN');
  assert.equal(categorize('data/lsj/e.json'), 'data/lsj');
  assert.equal(categorize('data/ngrams/lemma/occ/o-4.json'), 'data/ngrams');
  assert.equal(categorize('data/lsj-heads.json'), 'data (top-level files)');
  assert.equal(categorize('data/.DS_Store'), 'data (top-level files)');
  assert.equal(categorize('lemma/syzeo/index.html'), 'pages/lemma');
  assert.equal(categorize('EN/book/1/index.html'), 'pages/EN');
  assert.equal(categorize('index.html'), 'pages (root)');
  assert.equal(categorize('sw.js'), '(root files)');
  assert.equal(categorize('game/game.js'), 'game/');
  assert.equal(categorize('lemma/syzeo/'), 'lemma/');
});

// macOS ships openrsync, whose itemize flags are 7 characters, not GNU's 9. Read
// with the GNU-only pattern, every add and change went uncounted: a dry run
// reported "add 0, change 0" for a deploy that replaced 15 bundles.
const OPENRSYNC_DRY_RUN = [
  '*deleting gone.txt',
  '>f+++++++ added.txt',
  '>f..t.... touched.txt',
  'cd+++++++ newdir/',
  '>f+++++++ newdir/f.txt',
  '>f.s..... sub/changed.txt',
].join('\n');

test('parseRsyncItemized reads openrsync\'s 7-character flags too', () => {
  const r = parseRsyncItemized(OPENRSYNC_DRY_RUN);
  assert.deepEqual(r.added, ['added.txt', 'newdir/f.txt']);
  assert.deepEqual(r.modified, ['touched.txt', 'sub/changed.txt']);
  assert.deepEqual(r.deleted, ['gone.txt']);
});

test('groupByCategory reports counts per category, never a bare total', () => {
  const groups = groupByCategory(parseRsyncItemized(RSYNC_DRY_RUN).deleted);
  assert.deepEqual([...groups.keys()], ['_astro', 'data/APo', 'data/Meta', 'data/reports', 'lemma/', 'pages/lemma']);
  assert.deepEqual(groups.get('data/reports'), ['data/reports/quality_EN.json', 'data/reports/quality_Meta.json']);
  const lines = formatCategoryReport(groups, { limit: 1, indent: '' });
  assert.ok(lines.includes('data/reports: 2'));
  assert.ok(lines.includes('+1 more'));
  assert.ok(lines.includes('data/Meta: 1'));
});

// -- data/ deletion audit ----------------------------------------------------

// Files at gh-pages HEAD, as one `git ls-tree -r --name-only` would list them:
// files only, so the deleted directory lemma/syzeo is not in it.
const LIVE_FILES = new Set([
  'data/reports/quality_EN.json',
  'data/reports/quality_Meta.json',
  'data/Meta/quotations.json',
  'data/APo/third-titles.json',
  '_astro/Reader.DZMUvdM2.js',
  'lemma/syzeo/index.html',
]);

test('auditDataDeletions restores every live file under data/ by default and ignores the rest', () => {
  const audit = auditDataDeletions(parseRsyncItemized(RSYNC_DRY_RUN).deleted, LIVE_FILES);
  assert.deepEqual(audit.restore, [
    'data/reports/quality_EN.json',
    'data/reports/quality_Meta.json',
    'data/Meta/quotations.json',
    'data/APo/third-titles.json',
  ]);
  assert.deepEqual(audit.delete, []);
});

test('auditDataDeletions lets a deletion through only under an allowed prefix', () => {
  const deleted = parseRsyncItemized(RSYNC_DRY_RUN).deleted;
  const audit = auditDataDeletions(deleted, LIVE_FILES, ['data/APo', 'data/Meta/quotations.json']);
  assert.deepEqual(audit.restore, ['data/reports/quality_EN.json', 'data/reports/quality_Meta.json']);
  assert.deepEqual(audit.delete, ['data/Meta/quotations.json', 'data/APo/third-titles.json']);
  const all = auditDataDeletions(deleted, LIVE_FILES, ['data']);
  assert.deepEqual(all.restore, []);
  assert.equal(all.delete.length, 4);
});

test('auditDataDeletions matches allowed prefixes on whole path segments, not string prefixes', () => {
  const live = new Set(['data/reports-old/x.json', 'data/reports/y.json', 'data/Meta/quotations.json.bak']);
  const audit = auditDataDeletions([...live], live, ['data/reports', 'data/Meta/quotations.json']);
  assert.deepEqual(audit.delete, ['data/reports/y.json']);
  assert.deepEqual(audit.restore, ['data/reports-old/x.json', 'data/Meta/quotations.json.bak']);
});

test('a data/ deletion that is not a file at HEAD (a directory, or never live) is neither restored nor reported', () => {
  const audit = auditDataDeletions(['data/reports', 'data/reports/', 'data/new/never-live.json'], new Set(['data/reports/x.json']));
  assert.deepEqual(audit, { restore: [], delete: [] });
});

test('a bundle rehash and a dropped lemma page are not data deletions', () => {
  const audit = auditDataDeletions(['_astro/global.old.css', 'lemma/syzeo/index.html'], new Set(['_astro/global.old.css', 'lemma/syzeo/index.html']));
  assert.deepEqual(audit, { restore: [], delete: [] });
});

test('parseDataPrefixes accepts prefixes under data/ and rejects anything else', () => {
  assert.deepEqual(parseDataPrefixes('data/APo, data/Meta/quotations.json/'), ['data/APo', 'data/Meta/quotations.json']);
  assert.deepEqual(parseDataPrefixes('data'), ['data']);
  assert.throws(() => parseDataPrefixes('reports'), /must be data or lie under data\//);
  assert.throws(() => parseDataPrefixes('database/x'), /must be data or lie under data\//);
  assert.throws(() => parseDataPrefixes(''), /at least one prefix/);
});

// -- leak scan ---------------------------------------------------------------

const BASELINE = [
  { path: 'data/EN/manifest.json', text: '{"english_translation":"H. Rackham (Loeb, 1926)","author":"Aristotle"}' },
  { path: 'data/EN/footnotes.json', text: '["Rackham reads ...", "so Rackham, Bywater", "Aristotle says"]' },
  { path: 'data/Meta/book-07.json', text: '{"work":"Metaphysics","author":"Aristotle"}' },
  { path: 'data/lsj/a.json', text: '{"a)gaqo/s":{"html":"Arist. EN 1094a"}}' },
];

test('scanForLeaks passes the documented baseline (Rackham manifest ×1, footnotes ×2)', () => {
  const report = scanForLeaks(BASELINE);
  assert.equal(report.ok, true, report.problems.join('\n'));
  assert.equal(report.filesScanned, 4);
  assert.equal(report.control.files, 3);
  assert.equal(report.names.Rackham.files, 2);
  assert.equal(report.names.Rackham.occurrences, 3);
  for (const name of ['Ackrill', 'Tredennick', 'Irwin']) assert.equal(report.names[name].files, 0);
});

test('scanForLeaks scans all four gated names', () => {
  assert.deepEqual(LEAK_NAMES, ['Ackrill', 'Tredennick', 'Irwin', 'Rackham']);
  assert.ok(KNOWN_BENIGN.every((b) => LEAK_NAMES.includes(b.name)));
});

test('scanForLeaks fails on a gated name in a file that is not known benign', () => {
  const report = scanForLeaks([
    ...BASELINE,
    { path: 'data/Cat/book-01.json', text: '{"translator":"J. L. Ackrill","text":"Aristotle"}' },
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0], /Ackrill in data\/Cat\/book-01\.json/);
});

test('scanForLeaks fails when a benign file grows more occurrences than allowed', () => {
  const grown = BASELINE.map((f) => (f.path === 'data/EN/footnotes.json'
    ? { ...f, text: f.text + ' Rackham translates this passage as: ...' }
    : f));
  const report = scanForLeaks(grown);
  assert.equal(report.ok, false);
  assert.match(report.problems[0], /data\/EN\/footnotes\.json: 3 occurrences, KNOWN_BENIGN allows 2/);
});

test('scanForLeaks aborts when the positive control "Aristotle" is absent', () => {
  const report = scanForLeaks(BASELINE.map((f) => ({ ...f, text: f.text.replaceAll('Aristotle', 'Plato') })));
  assert.equal(report.ok, false);
  assert.equal(report.control.files, 0);
  assert.match(report.problems[0], /positive control failed/);
});

test('scanForLeaks with zero files is a failed control, not a clean run', () => {
  const report = scanForLeaks([]);
  assert.equal(report.ok, false);
  assert.match(report.problems[0], /found in 0 of 0 files/);
});

// -- dangling bundle references ---------------------------------------------

test('findDanglingReferences is clean when only new hashes are referenced', () => {
  const pages = [
    { path: 'index.html', text: '<link href="/aristotle-reader/_astro/global.jhbSq3zm.css">' },
    { path: 'EN/book/1/index.html', text: '<script src="/aristotle-reader/_astro/Reader.DEnkf2zT.js">' },
  ];
  const r = findDanglingReferences(pages, ['_astro/global.CzLKCRk8.css', '_astro/Reader.DZMUvdM2.js'], ['_astro/global.jhbSq3zm.css', '_astro/Reader.DEnkf2zT.js']);
  assert.equal(r.ok, true, r.problems.join('\n'));
  assert.deepEqual(r.controlSeen.sort(), ['Reader.DEnkf2zT.js', 'global.jhbSq3zm.css']);
});

test('findDanglingReferences reports a page still loading a removed hash, and a dead control', () => {
  const pages = [{ path: 'index.html', text: '<link href="/aristotle-reader/_astro/global.CzLKCRk8.css">' }];
  const stale = findDanglingReferences(pages, ['_astro/global.CzLKCRk8.css'], ['_astro/global.jhbSq3zm.css']);
  assert.equal(stale.ok, false);
  assert.match(stale.problems.at(-1), /global\.CzLKCRk8\.css is still referenced by 1 file/);
  assert.match(stale.problems[0], /positive control failed/);
});

// The 2026-09-16 deploy of PR #120, as git staged it: one shared module
// (works.*.js) changed, so the six bundles importing it took new hashes and git
// paired each old and new name as a rename. The check read D and A only, so it
// never looked for the six old names, and it scanned HTML only, where nothing
// names works.*.js — its positive control failed and it refused a good deploy.
const RENAME_DIFF = [
  'R096\t_astro/BekkerJump.CPrTArjb.js\t_astro/BekkerJump.GEYlpXIi.js',
  'R099\t_astro/Reader.B7FlwZsq.js\t_astro/Reader.LxAeDsrc.js',
  'A\t_astro/works.CleK98BJ.js',
  'D\t_astro/works.DM2Cvq5d.js',
  'M\tEN/book/1/index.html',
  'R100\tsearch/a.html\tsearch/b.html',
  '',
].join('\n');

test('bundleChanges counts both halves of a renamed bundle', () => {
  const { removed, added } = bundleChanges(parseNameStatus(RENAME_DIFF));
  assert.deepEqual(removed.sort(), ['_astro/BekkerJump.CPrTArjb.js', '_astro/Reader.B7FlwZsq.js', '_astro/works.DM2Cvq5d.js']);
  assert.deepEqual(added.sort(), ['_astro/BekkerJump.GEYlpXIi.js', '_astro/Reader.LxAeDsrc.js', '_astro/works.CleK98BJ.js']);
});

test('isReferenceSource reads pages and scripts and stylesheets, not data', () => {
  for (const name of ['index.html', 'Reader.LxAeDsrc.js', 'global.D4AlQbbO.css']) assert.equal(isReferenceSource(name), true, name);
  for (const name of ['book-01.json', 'favicon.svg', 'icon-192.png']) assert.equal(isReferenceSource(name), false, name);
});

// The tree the gate walks, as main() hands it over: every file in the clone,
// filtered by whatever predicate the gate asks for.
const readTree = (tree) => (filter) => tree.filter((f) => filter(f.path.split('/').pop()));

const TREE_120 = [
  { path: 'EN/book/1/index.html', text: '<astro-island component-url="/aristotle-reader/_astro/Reader.LxAeDsrc.js">' },
  { path: '_astro/Reader.LxAeDsrc.js', text: 'import{w}from"./works.CleK98BJ.js";' },
  { path: '_astro/BekkerJump.GEYlpXIi.js', text: 'import{w}from"./works.CleK98BJ.js";' },
  { path: 'data/EN/book-01.json', text: '{"note":"Reader.B7FlwZsq.js"}' },
];

test('the #120 deploy passes: a module named only by bundles counts as the control', () => {
  const { removed, refs } = checkBundleReferences(parseNameStatus(RENAME_DIFF), readTree(TREE_120));
  assert.equal(removed.length, 3);
  assert.equal(refs.ok, true, refs.problems.join('\n'));
  assert.ok(refs.controlSeen.includes('works.CleK98BJ.js'), refs.controlSeen.join());
  assert.equal(refs.pagesScanned, 3);  // the data file is not read
});

test('a bundle still importing a removed module is caught', () => {
  const tree = TREE_120.map((f) => f.path === '_astro/BekkerJump.GEYlpXIi.js'
    ? { ...f, text: 'import{w}from"./works.DM2Cvq5d.js";' }
    : f);
  const { refs } = checkBundleReferences(parseNameStatus(RENAME_DIFF), readTree(tree));
  assert.equal(refs.ok, false);
  assert.match(refs.problems.join('\n'), /works\.DM2Cvq5d\.js is still referenced by 1 file \(e\.g\. _astro\/BekkerJump\.GEYlpXIi\.js\)/);
});

test('bundles alone cannot satisfy the control: some page must name a bundle', () => {
  const bundlesOnly = TREE_120.filter((f) => f.path.startsWith('_astro/'));
  const { refs } = checkBundleReferences(parseNameStatus(RENAME_DIFF), readTree(bundlesOnly));
  assert.equal(refs.ok, false);
  assert.match(refs.problems[0], /no page names an _astro bundle/);
});

test('a page control needs an HTML page that names a bundle', () => {
  // A script naming the _astro/ prefix is not a page, and a page naming no
  // bundle (offline.html) proves nothing about the pages that do.
  const tree = [
    ...TREE_120.filter((f) => f.path.startsWith('_astro/')),
    { path: 'sw.js', text: "if (url.pathname.includes('/_astro/')) cacheFirst();" },
    { path: 'offline.html', text: '<p>You are offline.</p>' },
  ];
  const { refs } = checkBundleReferences(parseNameStatus(RENAME_DIFF), readTree(tree));
  assert.equal(refs.pagesNamingBundles, 0);
  assert.equal(refs.ok, false);
});

test('with nothing removed there is nothing to check', () => {
  const { removed, refs } = checkBundleReferences(parseNameStatus('M\tindex.html\n'), () => { throw new Error('read'); });
  assert.deepEqual(removed, []);
  assert.equal(refs, null);
});

// -- verification targets, commit message, arguments -------------------------

test('verificationTargets lists the live-verified pattern with /bonitz/ as 404', () => {
  const targets = verificationTargets({ lemmaSlug: 'arithmos', assets: ['global.a.css'], removedAssets: ['_astro/Reader.old.js'] });
  const byPath = Object.fromEntries(targets.map((t) => [t.path, t.expect]));
  assert.equal(byPath['/'], 200);
  assert.equal(byPath['/EN/book/1/'], 200);
  assert.equal(byPath['/lemma/arithmos/'], 200);
  assert.equal(byPath['/data/lsj-heads.json'], 200);
  assert.equal(byPath['/data/Meta/quotations.json'], 200);
  assert.equal(byPath['/data/reports/quality_EN.json'], 200);
  assert.equal(byPath['/_astro/global.a.css'], 200);
  assert.equal(byPath['/_astro/Reader.old.js'], 404);
  assert.equal(byPath['/bonitz/'], 404);
  assert.ok(targets.every((t) => t.url.startsWith('https://aristotle.johnhboyer.com/')));
});

test('verifyLive polls until every target answers as expected', async () => {
  const targets = verificationTargets({ assets: [], removedAssets: [] });
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    const bonitz = url.endsWith('/bonitz/');
    // First round: the push has not propagated yet; everything but /bonitz/ 404s.
    if (calls <= targets.length && !bonitz) return { status: 404 };
    return { status: bonitz ? 404 : 200 };
  };
  const outcome = await verifyLive(targets, { attempts: 3, delayMs: 0, fetchImpl, log: () => {} });
  assert.equal(outcome.ok, true);
  const never = await verifyLive(targets, { attempts: 2, delayMs: 0, fetchImpl: async () => ({ status: 500 }), log: () => {} });
  assert.equal(never.ok, false);
  assert.equal(never.pending.length, targets.length);
});

test('commitMessage names the source commit', () => {
  const msg = commitMessage({ sourceSha: '52fad397b5abcdef0123', sourceBranch: 'main', summary: '6,441 files' });
  assert.match(msg, /^Deploy 52fad397b5 \(main\)/);
  assert.match(msg, /Source: 52fad397b5abcdef0123 on main/);
  assert.match(msg, /6,441 files/);
});

test('parseNameStatus reads git diff --cached --name-status', () => {
  const r = parseNameStatus('A\t_astro/new.js\nM\tindex.html\nD\t_astro/old.js\nR100\ta.html\tb.html\n');
  assert.deepEqual(r, { A: ['_astro/new.js'], M: ['index.html'], D: ['_astro/old.js'], R: ['a.html -> b.html'] });
});

test('parseArgs accepts the documented flags and rejects anything else', () => {
  const o = parseArgs(['--dry-run', '--remote=git@github.com:x/y.git', '--dist=/tmp/site', '--allow-data-deletions', '--verify']);
  assert.deepEqual(o, { dryRun: true, remote: 'git@github.com:x/y.git', dist: '/tmp/site', allowDataDeletions: ['data'], minPagesRatio: 0.5, verify: true, skipLinkCheck: false, help: false });
  assert.deepEqual(parseArgs([]).allowDataDeletions, []);
  assert.equal(parseArgs([]).minPagesRatio, 0.5);
  assert.equal(parseArgs(['--min-pages-ratio=0']).minPagesRatio, 0);
  assert.equal(parseArgs(['--min-pages-ratio=0.9']).minPagesRatio, 0.9);
  assert.throws(() => parseArgs(['--min-pages-ratio=2']), /number from 0 to 1/);
  assert.throws(() => parseArgs(['--min-pages-ratio=x']), /number from 0 to 1/);
  assert.deepEqual(parseArgs(['--allow-data-deletions=data/APo,data/reports']).allowDataDeletions, ['data/APo', 'data/reports']);
  assert.throws(() => parseArgs(['--allow-data-deletions=lemma']), /must be data or lie under data\//);
  assert.throws(() => parseArgs(['--force']), /Unknown option: --force/);
});

// ── The leak check's second half: gated translation SLOTS ───────────────────
// scanForLeaks matches translators' surnames, so gated prose that never names
// its translator passes it — and the "Aristotle" control only proves the scan
// opened the files. This is the structural half: a gated work (one with a
// -public.yaml) serves a known set of translation slots, and a slot appearing
// that the baseline does not list is a leak whatever the prose says.

test('scanGatedSlots passes when a gated work serves exactly its baseline slots', () => {
  const r = scanGatedSlots(
    [{ path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x', overlays: { a: 1 } }] }) }],
    { gated: new Set(['Cat']), baseline: { Cat: ['overlays', 'ross'] } },
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
});

test('scanGatedSlots fails on a slot the baseline does not list', () => {
  const r = scanGatedSlots(
    [{ path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x', third: 'Ackrill prose' }] }) }],
    { gated: new Set(['Cat']), baseline: { Cat: ['ross'] } },
  );
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /Cat.*third/);
});

// The point of the structural check: it does not read the prose at all, so it
// catches gated text whose translator is never named — the exact case
// scanForLeaks cannot see.
test('scanGatedSlots catches a leak with no translator name anywhere in it', () => {
  const text = JSON.stringify({ segments: [{ third: 'Every art and every inquiry seems to aim at some good.' }] });
  assert.equal(scanForLeaks([{ path: 'data/Cat/book-01.json', text: text + 'Aristotle' }]).problems.length, 0);
  const r = scanGatedSlots([{ path: 'data/Cat/book-01.json', text }], { gated: new Set(['Cat']), baseline: { Cat: [] } });
  assert.equal(r.ok, false);
});

// A search index holds a translation's words with their positions, which is
// the prose in another order: gated exactly as the slot it indexes.
test('scanGatedSlots fails on a search index for a slot the baseline does not list', () => {
  const book = { path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x' }] }) };
  const r = scanGatedSlots(
    [book, { path: 'data/Cat/search/english-third.json', text: '{"every":[[0,0]]}' }],
    { gated: new Set(['Cat']), baseline: { Cat: ['ross'] } },
  );
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /Cat.*english-third\.json/);
});

test('scanGatedSlots passes the search indexes of the slots a gated work serves', () => {
  const r = scanGatedSlots(
    [
      { path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x', overlays: { owen: [] } }] }) },
      { path: 'data/Cat/search/english-secondary.json', text: '{}' },
      { path: 'data/Cat/search/english-overlay-owen.json', text: '{}' },
      { path: 'data/Cat/search/english.json', text: '{}' },
    ],
    { gated: new Set(['Cat']), baseline: { Cat: ['overlays', 'ross'] } },
  );
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.deepEqual(r.indexes, { Cat: ['overlay-owen', 'secondary'] });
});

// The corpus search shards (stage 9) carry every work's English index under
// "<work>/<slot>", so a gated translation's words reach live through a shard
// as surely as through its own english-<slot>.json.
const catBook = { path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x', overlays: { owen: [] } }] }) };

test('scanGatedSlots fails on a shard carrying a slot the baseline does not list', () => {
  const r = scanGatedSlots(
    [catBook, { path: 'data/search-shards/english/ev.json', text: JSON.stringify({ every: { 'Cat/third': [[0, 0]], 'EN/third': [[1, 1]] } }) }],
    { gated: new Set(['Cat']), baseline: { Cat: ['overlays', 'ross'] } },
  );
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /search-shards.*Cat\/third/);
  assert.doesNotMatch(r.problems.join('\n'), /EN/);
});

test('scanGatedSlots fails on a shard listing that names a slot the baseline does not list', () => {
  const index = { streams: { english: { shards: [], sources: { 'Cat/english': 'h', 'Cat/third': 'h' } } } };
  const r = scanGatedSlots(
    [catBook, { path: 'data/search-shards/index.json', text: JSON.stringify(index) }],
    { gated: new Set(['Cat']), baseline: { Cat: ['overlays', 'ross'] } },
  );
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /Cat\/third/);
});

test('scanGatedSlots passes shards that carry only the slots a gated work serves', () => {
  const shard = { the: { 'Cat/english': [[0, 0]], 'Cat/secondary': [[0, 1]], 'Cat/overlay-owen': [[0, 2]] } };
  const r = scanGatedSlots(
    [catBook, { path: 'data/search-shards/english/th.json', text: JSON.stringify(shard) }],
    { gated: new Set(['Cat']), baseline: { Cat: ['overlays', 'ross'] } },
  );
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.deepEqual(r.shardSources, { Cat: ['english', 'overlay-owen', 'secondary'] });
});

test('scanGatedSlots fails on a search index it cannot map to a slot', () => {
  const r = scanGatedSlots(
    [
      { path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x' }] }) },
      { path: 'data/Cat/search/english-ackrill.json', text: '{}' },
    ],
    { gated: new Set(['Cat']), baseline: { Cat: ['ross'] } },
  );
  assert.equal(r.ok, false);
});

test('scanGatedSlots ignores works that are not gated', () => {
  // EN is not gated and legitimately serves `third`; Cat is here so the check
  // is actually running (an empty scan is its own failure, below).
  const r = scanGatedSlots(
    [
      { path: 'data/EN/book-01.json', text: JSON.stringify({ segments: [{ third: 'x' }] }) },
      { path: 'data/Cat/book-01.json', text: JSON.stringify({ segments: [{ ross: 'x' }] }) },
    ],
    { gated: new Set(['Cat']), baseline: { Cat: ['ross'] } },
  );
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.deepEqual(r.seen, { Cat: ['ross'] });
});

test('scanGatedSlots refuses to pass when it saw no gated work at all', () => {
  // Same failure mode the "Aristotle" positive control exists for: a scan that
  // examined nothing must not report clean.
  const r = scanGatedSlots([], { gated: new Set(['Cat']), baseline: { Cat: [] } });
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /no gated work/i);
});

// ── The partial-dist floor ─────────────────────────────────────────────────
// A dist holding one empty index.html passed every default gate, and the rsync
// then deleted the reader pages, the lemma pages and the bundles. Only a
// wholly empty dist was refused.

test('auditDistScale accepts a dist the same size as live', () => {
  assert.equal(auditDistScale(6612, 6609, 0.5).ok, true);
});

test('auditDistScale accepts ordinary growth and ordinary trimming', () => {
  assert.equal(auditDistScale(7000, 6609, 0.5).ok, true);
  assert.equal(auditDistScale(5000, 6609, 0.5).ok, true);
});

test('auditDistScale refuses a dist that lost most of the live pages', () => {
  const r = auditDistScale(1, 6609, 0.5);
  assert.equal(r.ok, false);
  assert.match(r.reason, /1 page/);
  assert.match(r.reason, /6609/);
});

test('auditDistScale is a no-op against an empty live branch (first deploy)', () => {
  assert.equal(auditDistScale(3, 0, 0.5).ok, true);
});

test('auditDistScale can be overridden deliberately', () => {
  assert.equal(auditDistScale(1, 6609, 0).ok, true);
});

// ── Every served translation has its search index ───────────────────────────
test('scanTranslationIndexes passes when each translation beyond the primary is indexed', () => {
  const r = scanTranslationIndexes([
    { path: 'data/EN/book-01.json', text: JSON.stringify({ segments: [{ ross: [{ text: 'x' }], third: [{ text: 'y' }], overlays: { peters: [{ text: 'z' }] } }] }) },
    { path: 'data/EN/search/english-secondary.json', text: '{}' },
    { path: 'data/EN/search/english-third.json', text: '{}' },
    { path: 'data/EN/search/english-overlay-peters.json', text: '{}' },
    { path: 'data/Phys/book-01.json', text: JSON.stringify({ segments: [{ english: { text: 'x' } }] }) },
  ]);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.indexed, 3);
});

test('scanTranslationIndexes refuses a translation served without its index', () => {
  const r = scanTranslationIndexes([
    { path: 'data/EN/book-01.json', text: JSON.stringify({ segments: [{ ross: [{ text: 'x' }], overlays: { peters: [{ text: 'z' }] } }] }) },
    { path: 'data/EN/search/english-secondary.json', text: '{}' },
  ]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /EN.*english-overlay-peters\.json/);
});

test('scanTranslationIndexes refuses to pass when it saw no book at all', () => {
  const r = scanTranslationIndexes([{ path: 'data/EN/search/english.json', text: '{}' }]);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /not running/);
});

// ── The corpus search shards were built from the indexes being served ───────
// index.json records, per source, a hash of the per-work index the shard
// postings were copied from. A work rebuilt without re-running stage 9 leaves
// shards whose seg_idx numbers name the wrong passages.
const h = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
const EN_LEMMA = '{"logos": [[0, 1]]}';
const EN_ENGLISH = '{"virtue": [[0, 0]]}';
const EN_THIRD = '{"mean": [[0, 2]]}';
function shardListing(overrides = {}) {
  return {
    path: 'data/search-shards/index.json',
    text: JSON.stringify({ streams: {
      lemma: { shards: ['lo'], sources: { EN: h(EN_LEMMA) } },
      form: { shards: ['lo'], sources: { EN: h(EN_LEMMA) } },
      english: { shards: ['vi', 'me'], sources: { 'EN/english': h(EN_ENGLISH), 'EN/third': h(EN_THIRD), ...overrides } },
    } }),
  };
}
const enIndexes = [
  { path: 'data/EN/search/greek_lemma.json', text: EN_LEMMA },
  { path: 'data/EN/search/greek_form.json', text: EN_LEMMA },
  { path: 'data/EN/search/english.json', text: EN_ENGLISH },
  { path: 'data/EN/search/english-third.json', text: EN_THIRD },
  { path: 'data/EN/search/meta.json', text: '[]' },
];
const shard = (path, doc) => ({ path: `data/search-shards/${path}`, text: JSON.stringify(doc) });
const enShards = [
  shard('lemma/lo.json', { logos: { EN: [[0, 1]] } }),
  shard('form/lo.json', { logos: { EN: [[0, 1]] } }),
  shard('english/vi.json', { virtue: { 'EN/english': [[0, 0]] } }),
  shard('english/me.json', { mean: { 'EN/third': [[0, 2]] } }),
];
const without = (name) => enShards.filter((f) => !f.path.endsWith(name));

test('scanSearchShards passes shards built from exactly the indexes served', () => {
  const r = scanSearchShards([shardListing(), ...enShards, ...enIndexes]);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.equal(r.sources, 4);
  assert.equal(r.postings, 4);
});

// The listing's hashes say which index the shards were built from; the shard
// files are what the reader actually reads, so they are compared too.
test('scanSearchShards refuses a listed shard that is not served', () => {
  const r = scanSearchShards([shardListing(), ...without('english/me.json'), ...enIndexes]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /english\/me\.json.*missing/);
});

test('scanSearchShards refuses shard postings that differ from the index, hashes notwithstanding', () => {
  const r = scanSearchShards([shardListing(), ...without('english/vi.json'),
    shard('english/vi.json', { virtue: { 'EN/english': [[0, 9]] } }), ...enIndexes]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /EN\/english.*1 word.*virtue/);
});

test('scanSearchShards refuses a word filed under the wrong shard', () => {
  const misfiled = shard('english/me.json', { mean: { 'EN/third': [[0, 2]] }, virtue: { 'EN/english': [[0, 0]] } });
  const r = scanSearchShards([shardListing(), ...enShards.slice(0, 2), misfiled, ...enIndexes]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /'virtue'.*belongs in vi/);
});

test('scanSearchShards refuses to pass when the shards hold no postings', () => {
  const r = scanSearchShards([shardListing(), ...enIndexes]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /no postings/);
});

test('scanSearchShards refuses shard postings for a source neither served nor listed', () => {
  const ghost = shard('english/vi.json', { virtue: { 'EN/english': [[0, 0]], 'Ghost/english': [[9, 9]] } });
  const r = scanSearchShards([shardListing(), ...without('english/vi.json'), ghost, ...enIndexes]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /Ghost\/english/);
});

test('scanSearchShards ignores a shard file the listing does not name, readable or not', () => {
  const r = scanSearchShards([shardListing(), ...enShards, { path: 'data/search-shards/english/zz.json', text: 'broken' }, ...enIndexes]);
  assert.equal(r.ok, true, r.problems.join('; '));
});

test('shardName files a word where stage 9 does', () => {
  const fixture = JSON.parse(readFileSync(new URL('../../pipeline/tests/fixtures/search_shards.json', import.meta.url), 'utf8'));
  for (const { word, shard: name } of fixture.cases) assert.equal(shardName(word), name, word);
});

test('scanSearchShards refuses shards older than an index served beside them', () => {
  const rebuilt = enIndexes.map((f) => (f.path.endsWith('english-third.json') ? { ...f, text: '{"mean": [[3, 2]]}' } : f));
  const r = scanSearchShards([shardListing(), ...enShards, ...rebuilt]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /older.*EN\/third/);
});

test('scanSearchShards refuses an index the shards do not hold', () => {
  const r = scanSearchShards([shardListing(), ...enShards, ...enIndexes, { path: 'data/EN/search/english-secondary.json', text: '{}' }]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /does not hold.*EN\/secondary/);
});

test('scanSearchShards refuses shards holding an index nothing serves', () => {
  const r = scanSearchShards([shardListing({ 'EN/overlay-peters': 'abc' }), ...enShards, ...enIndexes]);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /EN\/overlay-peters.*no work serves/);
});

test('scanSearchShards refuses a corpus without shards', () => {
  const r = scanSearchShards(enIndexes);
  assert.equal(r.ok, false);
  assert.match(r.problems.join('\n'), /no data\/search-shards\/index\.json/);
});

test('scanSearchShards refuses to pass when it saw no index at all', () => {
  const r = scanSearchShards([shardListing()]);
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /not running/);
});
