import { afterEach, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { search, searchCombo, loadOffsets } from '../lib/search';
import { paginate, hitCount } from '../lib/search-pages';
import { WORKS } from '../lib/works';
const dataPresent = existsSync(resolve('../app/public/data/EN/search/offsets.json'));
afterEach(() => vi.unstubAllGlobals());
it.skipIf(!dataPresent)('checks the three requested page counts (needs the built corpus)', async () => {
 vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const path = String(url).split('/data/')[1];
  try { const bytes = readFileSync(resolve('../app/public/data', path)); return { ok: true, json: async () => JSON.parse(bytes.toString()), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; }
  catch { return { ok: false, status: 404 }; }
 }));
 const works = WORKS.map(w => w.id);
 const offsets = new Map(await Promise.all(works.map(async w => [w, await loadOffsets(w)] as const)));
 const phrase = await search('τὸ τί ἦν εἶναι', '', 'phrase', 'all', 'and', works, 'form');
 expect(phrase.results.reduce((n,r) => n+hitCount(r),0)).toBe(102);
 const virtue = await search('ἀρετή', '', 'all', 'all', 'and', works, 'lemma');
 const grammar = await searchCombo([{ kind: 'grammatical', query: { case: 'gen', number: 'pl' } }, { kind: 'lemma', terms: ['ἀρετή'], relation: 'near' }], { window: 10, unit: 'words', ordered: false, crossChapter: true }, works);
 for (const [name, outcome, expected] of [['phrase', phrase, 3], ['virtue', virtue, 29], ['grammar', grammar, 21]] as const) {
  console.log(name, 'hits', outcome.results.reduce((n,r) => n+hitCount(r),0), 'pages', paginate(outcome.results, offsets, 40).pages.length, 'failed', outcome.failedWorks);
  expect(outcome.failedWorks).toEqual([]);
  expect(paginate(outcome.results, offsets, 40).pages).toHaveLength(expected);
 }
}, 120000);
