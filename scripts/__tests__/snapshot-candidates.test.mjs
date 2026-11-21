// node --test scripts/__tests__/
// The pure functions of scripts/snapshot-candidates.mjs. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { candidates, expandShards, gradesItself, recall, siteIndexes, templates, worksIn } from '../snapshot-candidates.mjs';

const RECORD = [
  'lemmata.json', 'EN/manifest.json', 'EN/book-01.json', 'EN/book-10.json', 'EN/search/english.json',
  'lemma-map/a.json', 'ngrams/form/occ/a-2.json', 'lemmata/_index.json', 'lemmata/logos.json', 'reports/summary.json',
];

test('templates take the work and the numbers out of a key record', () => {
  assert.deepEqual([...worksIn(RECORD)], ['EN']);
  const t = templates([RECORD]);
  assert.deepEqual([...t.root], ['lemmata.json']);
  assert.deepEqual([...t.perWork].sort(), ['book-{2}.json', 'manifest.json', 'search/english.json']);
  assert.deepEqual([...t.dirs.keys()].sort(), ['lemma-map', 'lemmata', 'ngrams/form/occ', 'reports']);
});

test('expandShards fills in the alphabet, and leaves other folders alone', () => {
  assert.equal(expandShards(new Set(['a.json'])).size, 27);
  assert.ok(expandShards(new Set(['a-2.json'])).has('q-6.json'));
  assert.deepEqual([...expandShards(new Set(['summary.json']))], ['summary.json']);
});

test('candidates name each work, edition, translation, lemma page and shard', () => {
  const list = candidates({
    works: [{ id: 'agamemnon', books: 2, editionPaths: ['ed/smyth-loeb/'], translations: ['kosmos'] }],
    t: templates([RECORD]), names: ['speeches.json'], lemmaSlugs: ['eimi'], shardStreams: { lemma: ['a_', 'ab'] },
  });
  for (const want of ['lemmata.json', 'speeches.json', 'agamemnon/manifest.json', 'agamemnon/book-01.json', 'agamemnon/book-02.json',
    'agamemnon/ed/smyth-loeb/book-02.json', 'agamemnon/speeches.json', 'agamemnon/search/english-overlay-kosmos.json',
    'lemma-map/z.json', 'ngrams/form/occ/k-4.json', 'lemmata/eimi.json', 'lemmata/_index.json',
    'search-shards/index.json', 'search-shards/lemma/ab.json', 'reports/quality_agamemnon.md', 'reports/summary.json']) {
    assert.ok(list.includes(want), `missing ${want}`);
  }
  assert.ok(!list.includes('agamemnon/book-03.json'), 'no book past the manifest count');
  assert.ok(!list.includes('lemmata/logos.json'), "another reader's lemma pages are not guessed");
  assert.ok(!list.some(k => k.startsWith('EN/')), "another reader's works are not guessed");
});

// The failing case: the measure must show what a list missed, not round it away.
test('recall counts the real keys the list missed, by family', () => {
  const r = recall(['EN/manifest.json', 'lemmata.json', 'not/real.json'], RECORD);
  assert.deepEqual([r.keys, r.named, r.listed], [10, 2, 3]);
  assert.deepEqual([r.families['<work>'].keys, r.families['<work>'].named], [4, 1]);
  assert.deepEqual(r.families['<work>'].missed, ['EN/book-01.json', 'EN/book-10.json', 'EN/search/english.json']);
  assert.equal(r.families.reports.named, 0);
  assert.equal(recall([], []).share, 0);
});

test('siteIndexes reads works, books, editions, translations, slugs and shards from the site itself', async () => {
  const files = {
    'agamemnon/manifest.json': JSON.stringify({ citation: { books: [{ n: 1 }] }, greekEditions: [{ id: 'x', path: 'ed/x/' }], translations: [{ id: 'smyth' }] }),
    'lemmata/_index.json': JSON.stringify([{ slug: 'eimi', key: 'ei)mi/' }]),
    'search-shards/index.json': JSON.stringify({ streams: { lemma: { shards: ['a_'] } } }),
  };
  const got = await siteIndexes(async k => files[k] ?? null, ['aeschylus', 'agamemnon', 'agamemnon', 'read']);
  assert.deepEqual(got, {
    works: [{ id: 'agamemnon', books: 1, editionPaths: ['ed/x/'], translations: ['smyth'] }],
    lemmaSlugs: ['eimi'], shardStreams: { lemma: ['a_'] },
  });
});

// Review finding, 2026-11-20 (Codex): the measure must not be handed its own answers.
test('gradesItself: the target\'s own key record among --records is refused', () => {
  assert.equal(gradesItself([RECORD, ['x.json']], [...RECORD].reverse()), true);
  assert.equal(gradesItself([['x.json']], RECORD), false);
});

test('gradesItself: a record that shares any work with the target is refused, even padded; shared families alone are not', () => {
  assert.equal(gradesItself([[...RECORD, 'extra/one.json']], RECORD), true);
  assert.equal(gradesItself([['Crito/manifest.json', 'lemmata.json', 'lemma-map/a.json']], RECORD), false);
});
