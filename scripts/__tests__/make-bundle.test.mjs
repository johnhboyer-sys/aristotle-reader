import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { HOST_FILES, makeBundle } from '../make-bundle.mjs';
import { scanForLeaks } from '../deploy-gh-pages.mjs';
import { verifyTarget } from '../verify-snapshot.mjs';

const SCRIPT = fileURLToPath(new URL('../make-bundle.mjs', import.meta.url));

// The leak check alone: the deploy's other gates need a whole corpus.
const leakOnly = (served) => [['leak check', scanForLeaks(served((n) => n.endsWith('.json')))]];

// A same-origin build in small: pages, a worker with no data root, data, and
// the primary host's own files.
function site(change = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'make-bundle-'));
  const dist = path.join(root, 'dist');
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
    writeFileSync(path.join(dist, rel), text);
  };
  put('index.html', '<h1>Aristotle</h1>');
  put('Cat/index.html', '<p>Categories</p>');
  put('sw.js', "// worker\nconst DATA_ROOT = '';\n");
  put('data/Cat/manifest.json', '{"author":"Aristotle"}');
  put('data/Cat/chapters/1.json', '{"greek":"Ὁμώνυμα λέγεται"}');
  for (const name of HOST_FILES) put(name, 'primary host only\n');
  change({ dist, put });
  return { root, dist, out: path.join(root, 'bundle.tar.gz') };
}

const run = (s, gates = leakOnly) => {
  try { return makeBundle({ dist: s.dist, out: s.out, gates }); } finally { /* the caller removes s.root */ }
};
// The files an archive holds; tar lists folders too, each ending in "/".
const names = (archive) => spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' }).stdout.trim().split('\n')
  .filter((n) => !n.endsWith('/')).map((n) => n.replace(/^\.\//, '')).sort();

function refuses(change, pattern, gates) {
  const s = site(change);
  try {
    const r = run(s, gates);
    assert.equal(r.ok, false, 'the bundle should have been refused');
    assert.match(r.problems.join('\n'), pattern);
    assert.equal(existsSync(s.out), false, 'a refused bundle leaves no archive behind');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
}

test('packs every built file but the host files, with sums that verify', () => {
  const s = site();
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.equal(r.ok, true);
    assert.deepEqual(names(s.out), ['Cat/index.html', 'SHA256SUMS', 'data/Cat/chapters/1.json', 'data/Cat/manifest.json', 'index.html', 'sw.js']);
    assert.equal(r.files, 5);
    assert.deepEqual(r.left, HOST_FILES);
    const v = verifyTarget(s.out);
    assert.equal(v.ok, true);
    assert.equal(v.read, 5);
    // The folder that was packed is as it was.
    for (const name of HOST_FILES) assert.equal(existsSync(path.join(s.dist, name)), true);
    assert.equal(existsSync(path.join(s.dist, 'SHA256SUMS')), false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('the archive carries no Mac side files, and a host file’s name deeper down stays', () => {
  const s = site(({ put }) => { put('data/Cat/CNAME', 'not the host file'); put('data/Cat/-C', '{}'); });
  try {
    assert.equal(run(s).ok, true);
    const got = names(s.out);
    assert.equal(got.some((n) => path.posix.basename(n).startsWith('._')), false);
    assert.equal(got.includes('data/Cat/CNAME'), true);
    assert.equal(got.includes('CNAME'), false);
    assert.equal(got.includes('data/Cat/-C'), true);
    assert.equal(got.length, 8);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('refuses a build made for data on another host', () => {
  refuses(({ put }) => put('sw.js', 'const DATA_ROOT = "https://data.example.org";\n'), /built for data at https:\/\/data\.example\.org/);
  refuses(({ put }) => put('.assetsignore', 'data\n'), /\.assetsignore/);
  refuses(({ put }) => put('_redirects', '/data/* https://data.example.org/:splat 302\n'), /_redirects/);
});

test('refuses a build with no worker line, no data, or no home page', () => {
  refuses(({ put }) => put('sw.js', '// no root here\n'), /sw\.js has no DATA_ROOT line/);
  refuses(({ dist }) => rmSync(path.join(dist, 'sw.js')), /no sw\.js/);
  refuses(({ dist }) => rmSync(path.join(dist, 'data'), { recursive: true }), /no data files/);
  refuses(({ dist }) => rmSync(path.join(dist, 'index.html')), /no index\.html/);
});

test('refuses when the host-file list names a file the build does not hold', () => {
  refuses(({ dist }) => rmSync(path.join(dist, HOST_FILES[0])), new RegExp(`names ${HOST_FILES[0]}, which this build does not hold`));
});

test('refuses a link, a Finder file, and a file named like the sums', () => {
  refuses(({ dist }) => symlinkSync(path.join(dist, 'index.html'), path.join(dist, 'home.html')), /home\.html is not a plain file or folder/);
  refuses(({ put }) => put('Cat/.DS_Store', 'x'), /Cat\/\.DS_Store/);
  refuses(({ put }) => put('SHA256SUMS', 'x'), /already holds SHA256SUMS/);
});

test('refuses a gated translator’s name in the data, and data the check cannot read', () => {
  refuses(({ put }) => put('data/Cat/translation.json', '{"by":"Ackrill"}'), /leak check: Ackrill in data\/Cat\/translation\.json/);
  refuses(({ put }) => put('data/Cat/manifest.json', '{"author":"someone"}'), /leak check: positive control failed/);
});

test('runs the gates on data files only, and on every one', () => {
  const seen = [], text = [];
  const s = site(({ put }) => { put('notes.json', '{"by":"Ackrill"}'); put('data/Cat/readme.txt', 'plain'); });
  try {
    const r = run(s, (served) => {
      for (const f of served(() => true)) seen.push(f.path);
      for (const f of served((n) => n.endsWith('.txt'))) text.push(f.path);
      return [['count', { ok: true, problems: [] }]];
    });
    assert.equal(r.ok, true);
    assert.deepEqual(seen.sort(), ['data/Cat/chapters/1.json', 'data/Cat/manifest.json', 'data/Cat/readme.txt']);
    assert.deepEqual(text, ['data/Cat/readme.txt']);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('refuses to write over a file, and a gate list that is empty', () => {
  const s = site();
  try {
    writeFileSync(s.out, 'mine');
    const r = run(s);
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /already exists/);
    assert.equal(readFileSync(s.out, 'utf8'), 'mine');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
  refuses(() => {}, /no gate ran/, () => []);
});

test('refuses bytes that change after a gate has read them', () => {
  // The gate passes what it read; the file is then rewritten with a gated name.
  const rewrite = (dist) => (served) => {
    const report = scanForLeaks(served((n) => n.endsWith('.json')));
    writeFileSync(path.join(dist, 'data/Cat/manifest.json'), '{"author":"Aristotle","by":"Ackrill"}');
    return [['leak check', report]];
  };
  let s = site();
  try {
    const r = run(s, rewrite(s.dist));
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /data\/Cat\/manifest\.json changed while the bundle was being made/);
    assert.equal(existsSync(s.out), false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
  // The same between two gates: the second must not be handed other bytes in silence.
  s = site();
  try {
    const r = run(s, (served) => [...rewrite(s.dist)(served), ['again', { ok: [...served(() => true)].length > 0, problems: [] }]]);
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /data\/Cat\/manifest\.json changed while the bundle was being made/);
    assert.equal(existsSync(s.out), false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
  // And the worker, read for its data root before the gates run.
  s = site();
  try {
    const r = run(s, (served) => {
      writeFileSync(path.join(s.dist, 'sw.js'), 'const DATA_ROOT = "https://data.example.org";\n');
      return leakOnly(served);
    });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /sw\.js changed while the bundle was being made/);
    assert.equal(existsSync(s.out), false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('refuses a name the two tars read differently', () => {
  const odd = / is not packed alike by every tar/;
  refuses(({ put }) => put('data/Cat/a\\t.json', '{}'), /"data\/Cat\/a\\\\t\.json": a name with a backslash/);
  for (const name of ['data/Cat/a.json ', 'data/Cat/ a.json', 'data/Cat /a.json', 'data/Cat/a\tb.json', 'lemma/λόγος/index.html', 'data/Cat/a\x7f.json']) {
    refuses(({ put }) => put(name, '{}'), odd);
  }
});

test('a name with a space or a leading dash is packed as it is', () => {
  const s = site(({ put }) => { put('data/Cat/two words.json', '{}'); put('-T/--help', 'x'); });
  try {
    assert.equal(run(s).ok, true);
    const got = names(s.out);
    assert.equal(got.includes('data/Cat/two words.json'), true);
    assert.equal(got.includes('-T/--help'), true);
    assert.equal(verifyTarget(s.out).read, 7);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('does not write over a file that appears while it works', () => {
  const s = site();
  try {
    const r = run(s, (served) => { writeFileSync(s.out, 'mine'); return leakOnly(served); });
    assert.equal(r.ok, false);
    assert.match(r.problems.join('\n'), /already exists/);
    assert.equal(readFileSync(s.out, 'utf8'), 'mine');
    assert.deepEqual(readdirSync(s.root).sort(), ['bundle.tar.gz', 'dist']);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('refuses a folder that is not there', () => {
  refuses(({ dist }) => rmSync(dist, { recursive: true }), /is not a folder/);
});

test('refuses an archive that does not read back against its sums', () => {
  // A tar that skips the step that adds the sums, one that drops a file, one
  // that adds a file, a file rewritten just before it is packed, and a gzip
  // that fails.
  const real = spawnSync('which', ['tar'], { encoding: 'utf8' }).stdout.trim();
  const sums = /does not match its SHA256SUMS/;
  const shims = [
    ['no sums', 'tar', `#!/bin/sh\ncase "$1" in -rf) exit 0;; esac\nexec ${real} "$@"\n`, sums],
    ['a file short', 'tar', `#!/bin/sh\nif [ "$1" = -cf ]; then sed -i.bak -e '/index.html/d' "$6"; fi\nexec ${real} "$@"\n`, sums],
    ['a file too many', 'tar', `#!/bin/sh\nif [ "$1" = -rf ]; then echo x > "$4/extra.txt"; exec ${real} "$@" ./extra.txt; fi\nexec ${real} "$@"\n`, /1 unlisted/],
    ['a file changed after its last read', 'tar', `#!/bin/sh\nif [ "$1" = -cf ]; then echo more >> "$4/index.html"; fi\nexec ${real} "$@"\n`, /1 changed/],
    // A file rewritten before packing, and its line in the sums rewritten to match.
    ['a file and its sum changed together', 'tar', `#!/usr/bin/env node
const { spawnSync } = require('node:child_process'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const a = process.argv.slice(2), note = path.join(__dirname, 'dist-path');
if (a[0] === '-cf') { fs.appendFileSync(path.join(a[3], 'index.html'), 'more'); fs.writeFileSync(note, a[3]); }
if (a[0] === '-rf') {
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(fs.readFileSync(note, 'utf8'), 'index.html'))).digest('hex');
  const sums = path.join(a[3], 'SHA256SUMS');
  fs.writeFileSync(sums, fs.readFileSync(sums, 'utf8').replace(/^[0-9a-f]{64}(  index\\.html)$/m, sha + '$1'));
}
process.exit(spawnSync('${real}', a, { stdio: 'inherit' }).status);
`, /the sums in the archive are not the sums this run took/],
    ['gzip fails', 'gzip', '#!/bin/sh\necho no room >&2\nexit 3\n', /gzip -n failed: no room/],
  ];
  for (const [what, command, shim, wrong] of shims) {
    const s = site();
    const bin = path.join(s.root, 'bin');
    mkdirSync(bin);
    writeFileSync(path.join(bin, command), shim, { mode: 0o755 });
    const before = process.env.PATH;
    process.env.PATH = `${bin}${path.delimiter}${before}`;
    try {
      const r = run(s);
      assert.equal(r.ok, false, what);
      assert.match(r.problems.join('\n'), wrong, what);
      assert.equal(existsSync(s.out), false, what);
      assert.deepEqual(readdirSync(s.root).sort(), ['bin', 'dist'], `${what}: nothing is left beside the output`);
      assert.equal(readFileSync(path.join(s.dist, 'sw.js'), 'utf8').includes('DATA_ROOT'), true, `${what}: the build is still there`);
    } finally {
      process.env.PATH = before;
      rmSync(s.root, { recursive: true, force: true });
    }
  }
});

test('tar and gzip do not take options from the caller’s environment', () => {
  // GNU tar obeys TAR_OPTIONS (--remove-files would delete the build), gzip obeys GZIP.
  const real = { tar: spawnSync('which', ['tar'], { encoding: 'utf8' }).stdout.trim(), gzip: spawnSync('which', ['gzip'], { encoding: 'utf8' }).stdout.trim() };
  const s = site();
  const bin = path.join(s.root, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'tar'), `#!/bin/sh\ncase "$1" in -cf|-rf|-xzOf|-xzf) if [ -n "$TAR_OPTIONS" ]; then echo TAR_OPTIONS reached tar >&2; exit 9; fi;; esac\nexec ${real.tar} "$@"\n`, { mode: 0o755 });
  writeFileSync(path.join(bin, 'gzip'), `#!/bin/sh\nif [ -n "$GZIP" ]; then echo GZIP reached gzip >&2; exit 9; fi\nexec ${real.gzip} "$@"\n`, { mode: 0o755 });
  const before = { PATH: process.env.PATH, TAR_OPTIONS: process.env.TAR_OPTIONS, GZIP: process.env.GZIP };
  process.env.PATH = `${bin}${path.delimiter}${before.PATH}`;
  process.env.TAR_OPTIONS = '--verbose';
  process.env.GZIP = '-1';
  try {
    const r = run(s);
    assert.deepEqual(r.problems, []);
    assert.equal(r.ok, true);
  } finally {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    rmSync(s.root, { recursive: true, force: true });
  }
});

test('the command line: exit codes and the count it prints', () => {
  const s = site();
  try {
    const bad = spawnSync(process.execPath, [SCRIPT, `--dist=${s.dist}`], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    const odd = spawnSync(process.execPath, [SCRIPT, `--dist=${s.dist}`, `--out=${s.out}`, '--force'], { encoding: 'utf8' });
    assert.equal(odd.status, 2);
    // The real gates need a real corpus, so this small site must be refused by them.
    const real = spawnSync(process.execPath, [SCRIPT, `--dist=${s.dist}`, `--out=${s.out}`], { encoding: 'utf8' });
    assert.equal(real.status, 1);
    assert.match(real.stdout, /^FAIL /m);
    assert.equal(existsSync(s.out), false);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});
