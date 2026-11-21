// node --test scripts/__tests__/
// The parts of the outside-calls check that need no browser: arguments, host
// names, and the verdict. The browser proofs are in
// check-no-outside-calls.browser.mjs, which this glob does not pick up.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_ALLOW, hostKey, localPage, parseArgs, parseTarget, verdict } from '../check-no-outside-calls.mjs';

const SCRIPT = fileURLToPath(new URL('../check-no-outside-calls.mjs', import.meta.url));
const dist = mkdtempSync(path.join(tmpdir(), 'no-outside-args-'));
writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');
const empty = mkdtempSync(path.join(tmpdir(), 'no-outside-empty-'));
after(() => { for (const dir of [dist, empty]) rmSync(dir, { recursive: true, force: true }); });

const usage = (fn, pattern) => assert.throws(fn, (e) => e.usage === true && pattern.test(e.message));

test('parseArgs: the defaults, and the base from SITE_BASE', () => {
  const a = parseArgs([`--dist=${dist}`], {});
  assert.deepEqual(a, { dist, allow: DEFAULT_ALLOW, base: '/' });
  assert.equal(parseArgs([`--dist=${dist}`], { SITE_BASE: '/mirror/' }).base, '/mirror/');
  assert.deepEqual(parseArgs([`--dist=${dist}`, '--allow=a.test,b.test'], {}).allow, ['a.test', 'b.test']);
});

test('parseArgs: the default list is Grammata and its packs host, exactly', () => {
  assert.deepEqual(DEFAULT_ALLOW, ['grammata.pages.dev', 'pub-d505f3fd993b4e01b2ab095428d0493e.r2.dev']);
});

test('parseArgs: bad arguments are usage errors', () => {
  usage(() => parseArgs([`--dist=${dist}`, '--verbose'], {}), /Unknown argument: --verbose/);
  usage(() => parseArgs([`--dist=${dist}`, 'app/dist'], {}), /Unknown argument: app\/dist/);
  usage(() => parseArgs([`--dist=${empty}`], {}), /No index\.html in /);
  usage(() => parseArgs([`--dist=${dist}`], { SITE_BASE: 'mirror' }), /SITE_BASE must start and end/);
  for (const bad of ['https://a.test', 'a.test:443', '*.a.test', '.a.test', 'a.test/x', 'A.test', '', 'a..test']) {
    usage(() => parseArgs([`--dist=${dist}`, `--allow=a.test,${bad}`], {}), /--allow takes bare host names/);
  }
});

test('hostKey and parseTarget: a port other than 80 or 443 is part of the name', () => {
  assert.equal(hostKey('a.test', 443), 'a.test');
  assert.equal(hostKey('a.test', 80), 'a.test');
  assert.equal(hostKey('a.test', 8443), 'a.test:8443');
  assert.deepEqual(parseTarget('connect', 'A.test:443'), { host: 'a.test', port: 443 });
  assert.deepEqual(parseTarget('http', 'http://a.test/x'), { host: 'a.test', port: 80 });
  assert.deepEqual(parseTarget('http', 'http://a.test:8080/x'), { host: 'a.test', port: 8080 });
  assert.deepEqual(parseTarget('http', '/not-absolute'), { host: '/not-absolute', port: 0 });
});

const clean = { seen: [], allow: DEFAULT_ALLOW, controlSeen: true, requests: 10, missing: [], planned: ['a', 'b'], ran: ['a', 'b'] };
const seen = (key, visit = 'a') => ({ kind: 'connect', host: key.replace(/:\d+$/, ''), key, target: `${key}:443`, visit });

test('verdict: clean, and allowed hosts are named on the last line', () => {
  assert.equal(verdict(clean).tail, '2 of 2 visits, 10 requests to the site (0 not found), 0 outside hosts asked for; control seen');
  const r = verdict({ ...clean, seen: [seen('grammata.pages.dev', 'b'), seen('grammata.pages.dev', 'b')] });
  assert.equal(r.ok, true);
  assert.match(r.tail, /1 outside host asked for, it allowed \(grammata\.pages\.dev x2\); control seen$/);
  assert.deepEqual(r.lines[0], '  allowed (refused all the same): grammata.pages.dev x2 (first: grammata.pages.dev:443 during "b")');
});

test('verdict: a host not on the list fails with its count, first target and visit; exact names only', () => {
  const r = verdict({ ...clean, seen: [seen('fonts.googleapis.com'), seen('fonts.googleapis.com', 'b'), seen('x.grammata.pages.dev'), seen('grammata.pages.dev:8443')],
    firstUrl: new Map([['fonts.googleapis.com', 'https://fonts.googleapis.com/css2']]) });
  assert.equal(r.ok, false);
  assert.deepEqual(r.denied, ['fonts.googleapis.com', 'x.grammata.pages.dev', 'grammata.pages.dev:8443']);
  assert.match(r.tail, /^3 outside hosts are not allowed: fonts\.googleapis\.com x2 \(first: https:\/\/fonts\.googleapis\.com\/css2 during "a"\), /);
});

test('verdict: the control, a visit not run, no requests, and 404s each fail', () => {
  assert.match(verdict({ ...clean, controlSeen: false, ran: [], requests: 0 }).tail, /^the block is not working.*control NOT seen$/);
  assert.match(verdict({ ...clean, ran: ['a'], visitFailures: ['visit "b" failed: x'] }).tail, /visit "b" failed: x; 1 visit did not run: b; 1 of 2 visits/);
  assert.match(verdict({ ...clean, requests: 0 }).tail, /the site got no requests: nothing was examined/);
  const r = verdict({ ...clean, missing: [{ path: '/x.png', visit: 'a' }] });
  assert.equal(r.ok, false);
  assert.ok(r.lines.includes('  not found: /x.png during "a"'));
});

test('verdict: an uncaught page error fails, whatever it names', () => {
  const blocked = { ...clean, seen: [seen('grammata.pages.dev')] };
  for (const message of ['Failed to fetch https://grammata.pages.dev/t8/lookup.js', 'TypeError: x is undefined']) {
    const r = verdict({ ...blocked, pageErrors: [{ message, visit: 'a' }] });
    assert.equal(r.ok, false);
    assert.match(r.tail, /1 uncaught page error;/);
  }
});

test('localPage: a hit must link to a page of this build, on this site', () => {
  const dist = mkdtempSync(path.join(tmpdir(), 'no-outside-unit-'));
  try {
    mkdirSync(path.join(dist, 'Cat/book/1'), { recursive: true });
    writeFileSync(path.join(dist, 'index.html'), '');
    writeFileSync(path.join(dist, 'Cat/index.html'), '');
    writeFileSync(path.join(dist, 'Cat/book/1/index.html'), '');
    const at = (href, url = 'http://127.0.0.1:5000/mirror/') => localPage(href, url, dist);
    assert.equal(at('http://127.0.0.1:5000/mirror/Cat/book/1/?loc=1a2#l'), 'Cat/book/1/');
    assert.equal(at('http://127.0.0.1:5000/Cat/book/1/', 'http://127.0.0.1:5000/'), 'Cat/book/1/');
    assert.equal(at('https://denied.example/mirror/Cat/book/1/'), null, 'another host');
    assert.equal(at('http://127.0.0.1:5001/mirror/Cat/book/1/'), null, 'another port');
    assert.equal(at('http://127.0.0.1:5000/Cat/book/1/'), null, 'outside the base');
    assert.equal(at('http://127.0.0.1:5000/abcdef/Cat/book/1/'), null, 'outside the base, with a prefix as long as the base');
    assert.equal(at('http://127.0.0.1:5000/mirror/Cat/book/missing/'), null, 'no such page');
    assert.equal(at('http://127.0.0.1:5000/mirror/'), null, 'the home page is not a work');
    assert.equal(at('http://127.0.0.1:5000/mirror/Cat/%2e%2e/Cat/book/1/'), 'Cat/book/1/');
    assert.equal(at('http://127.0.0.1:5000/mirror/..%2f..%2fetc/'), null);
    assert.equal(at('not a url'), null);
    mkdirSync(path.join(dist, 'ghost/index.html'), { recursive: true });
    assert.equal(at('http://127.0.0.1:5000/mirror/ghost/'), null, 'a folder named index.html is not a page');
  } finally { rmSync(dist, { recursive: true, force: true }); }
});

test('the command line: bad arguments exit 2 before any browser starts', () => {
  for (const args of [['--nope'], [`--dist=${empty}`], [`--dist=${dist}`, '--allow=https://a.test']]) {
    const p = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(p.status, 2, p.stderr);
    assert.match(p.stderr, /Usage: node scripts\/check-no-outside-calls\.mjs/);
  }
});
