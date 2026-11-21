// node --test "scripts/__tests__/site-params.test.mjs"
// The site's origin and base path as build parameters. The failing cases come first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { DEFAULT_ORIGIN, siteParams } from '../site-params.mjs';

test('an origin that is not a bare http(s) origin is refused, and the message names it', () => {
  for (const bad of ['aristotle.example.org', 'https://example.org/', 'https://example.org/reader', 'ftp://example.org', 'https://example.org?x=1', 'https://user@example.org', ' https://example.org']) {
    assert.throws(() => siteParams({ SITE_ORIGIN: bad }), (e) => e.message.includes('SITE_ORIGIN') && e.message.includes(JSON.stringify(bad)), bad);
  }
});

test('a base that does not start and end with "/" is refused', () => {
  for (const bad of ['mirror', '/mirror', 'mirror/', '//', '/a//b/', '/a b/', '/../', 'https://example.org/', '/a/?x', '/a/#b']) {
    assert.throws(() => siteParams({ SITE_BASE: bad }), (e) => e.message.includes('SITE_BASE') && e.message.includes(JSON.stringify(bad)), bad);
  }
});

test('unset or empty, the parameters give the primary site at the root', () => {
  assert.equal(DEFAULT_ORIGIN, 'https://aristotle.johnhboyer.com');
  assert.deepEqual(siteParams({}), { site: DEFAULT_ORIGIN, base: '/' });
  assert.deepEqual(siteParams({ SITE_ORIGIN: '', SITE_BASE: '' }), { site: DEFAULT_ORIGIN, base: '/' });
});

test('set, they are taken as given', () => {
  assert.deepEqual(siteParams({ SITE_ORIGIN: 'https://mirror.example.org', SITE_BASE: '/aristotle/' }), { site: 'https://mirror.example.org', base: '/aristotle/' });
  assert.deepEqual(siteParams({ SITE_ORIGIN: 'http://localhost:8080', SITE_BASE: '/a/b-c_d.e~f/' }), { site: 'http://localhost:8080', base: '/a/b-c_d.e~f/' });
});

test('the link check takes its base from the same parameter as the build', () => {
  const read = (env) => spawnSync(process.execPath, ['--input-type=module', '-e',
    `import { BASE } from ${JSON.stringify(fileURLToPath(new URL('../check-links.mjs', import.meta.url)))}; console.log(JSON.stringify(BASE));`],
  { encoding: 'utf8', env: { ...process.env, SITE_BASE: '', ...env } });
  assert.equal(read({}).stdout.trim(), '""');
  assert.equal(read({ SITE_BASE: '/mirror/' }).stdout.trim(), '"/mirror"');
  const bad = read({ SITE_BASE: 'mirror' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /SITE_BASE/);
});
