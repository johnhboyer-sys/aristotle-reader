import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchCombo, type ComboOptions, type ComboSlot } from '../lib/search';
import { hitCount } from '../lib/search-pages';

// S3's proof on real data: four proximity searches over the Nicomachean and
// Eudemian Ethics, each counted twice: by the engine, and by a brute-force
// scan written here from the books' own tokens and their analyses, with no
// engine code (no index, no offsets file, no folding helper). The two must
// agree. Needs the built corpus; skipped without it.
const DATA = resolve('../app/public/data');
const dataPresent = existsSync(resolve(DATA, 'EN/search/offsets.json')) && existsSync(resolve(DATA, 'EN/analyses.json'));
const WORKS = ['EN', 'EE'];

// Every token of a work in reading order, with its book and the dictionary
// words its analyses give, each as the plain letters of its Beta Code.
interface Token { book: number; lemmas: Set<string> }
const plain = (beta: string) => beta.toLowerCase().replace(/[^a-z]/g, '');
function tokens(work: string): Token[] {
  const analyses = JSON.parse(readFileSync(resolve(DATA, work, 'analyses.json'), 'utf8')) as Record<string, { lemma: string }[]>;
  const out: Token[] = [];
  for (const file of readdirSync(resolve(DATA, work)).filter((f) => /^book-\d+\.json$/.test(f)).sort()) {
    const book = JSON.parse(readFileSync(resolve(DATA, work, file), 'utf8'));
    for (const seg of book.segments) for (const line of seg.greek) for (const t of line.tokens) {
      out.push({ book: book.book, lemmas: new Set((analyses[t.k] ?? []).map((a) => plain(a.lemma))) });
    }
  }
  return out;
}

// Anchors (tokens of `first`) for which `holds` finds the rest.
function brute(work: string, first: string, holds: (a: number, at: (lemma: string) => number[], same: (i: number, j: number) => boolean) => boolean) {
  const toks = tokens(work);
  const index = new Map<string, number[]>();
  const at = (lemma: string) => {
    if (!index.has(lemma)) index.set(lemma, toks.flatMap((t, i) => (t.lemmas.has(lemma) ? [i] : [])));
    return index.get(lemma)!;
  };
  const same = (i: number, j: number) => toks[i].book === toks[j].book;
  return at(first).filter((a) => holds(a, at, same)).length;
}
const total = (count: (work: string) => number) => WORKS.reduce((n, w) => n + count(w), 0);

const lemma = (key: string, over: Partial<ComboSlot> = {}): ComboSlot => ({ kind: 'lemma', terms: [key], ...over });
const opts = (window: number, over: Partial<ComboOptions> = {}): ComboOptions => ({ window, unit: 'words', ordered: false, crossChapter: true, ...over });

describe('proximity on the Ethics, against a brute-force count', () => {
  afterEach(() => vi.unstubAllGlobals());
  const engine = async (slots: ComboSlot[], o: ComboOptions) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const path = String(url).split('/data/')[1];
      try {
        const bytes = readFileSync(resolve(DATA, path));
        return { ok: true, json: async () => JSON.parse(bytes.toString()), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
      } catch { return { ok: false, status: 404 }; }
    }));
    const out = await searchCombo(slots, o, WORKS);
    expect(out.failedWorks).toEqual([]);
    return out.results.reduce((n, r) => n + hitCount(r), 0);
  };

  it.skipIf(!dataPresent)('or: ἀρετή, either ἡδονή or λύπη near it, within 5 words', async () => {
    const expected = total((w) => brute(w, 'areth', (a, at, same) =>
      [...at('hdonh'), ...at('luph')].some((t) => same(a, t) && Math.abs(t - a) <= 5)));
    expect(expected).toBe(17);
    expect(await engine([lemma('areth'), lemma('hdonh'), lemma('luph', { or: true })], opts(5))).toBe(expected);
  }, 60000);

  it.skipIf(!dataPresent)('term from term: ἡδονή near ἀρετή, λύπη near ἡδονή, within 5 words', async () => {
    const expected = total((w) => brute(w, 'areth', (a, at, same) =>
      at('hdonh').some((h) => same(a, h) && Math.abs(h - a) <= 5
        && at('luph').some((l) => same(h, l) && Math.abs(l - h) <= 5))));
    expect(expected).toBe(7);
    expect(await engine([lemma('areth'), lemma('hdonh'), lemma('luph', { target: 1 })], opts(5))).toBe(expected);
    // Measured from ἀρετή instead, the three must share one window: fewer.
    const star = total((w) => brute(w, 'areth', (a, at, same) =>
      at('hdonh').some((h) => same(a, h) && Math.abs(h - a) <= 5
        && at('luph').some((l) => same(a, l) && Math.max(a, h, l) - Math.min(a, h, l) <= 5))));
    expect(star).toBe(5);
    expect(await engine([lemma('areth'), lemma('hdonh'), lemma('luph')], opts(5))).toBe(star);
  }, 60000);

  it.skipIf(!dataPresent)('not near: ἡδονή before ἀρετή, λύπη not near ἀρετή, within 10 words', async () => {
    // A λύπη within 10 words of either end of ἀρετή's neighbourhood (ἀρετή
    // and the ἡδονή before it) rules the pair out; another ἡδονή may serve.
    const expected = total((w) => brute(w, 'areth', (a, at, same) =>
      at('hdonh').some((h) => same(a, h) && h < a && a - h <= 10
        && !at('luph').some((l) => same(a, l) && l >= h - 10 && l <= a + 10))));
    expect(expected).toBe(6);
    expect(await engine([lemma('areth'), lemma('hdonh', { relation: 'before' }), lemma('luph', { relation: 'not' })], opts(10))).toBe(expected);
  }, 60000);

  it.skipIf(!dataPresent)('before: ἕξις before ἀρετή, within 5 words', async () => {
    const expected = total((w) => brute(w, 'areth', (a, at, same) =>
      at('ecis').some((x) => same(a, x) && x < a && a - x <= 5)));
    expect(expected).toBe(11);
    expect(await engine([lemma('areth'), lemma('ecis', { relation: 'before' })], opts(5))).toBe(expected);
  }, 60000);

  it.skipIf(!dataPresent)('in this order: ἀρετή, then ἕξις, within 5 words', async () => {
    const expected = total((w) => brute(w, 'areth', (a, at, same) =>
      at('ecis').some((x) => same(a, x) && x > a && x - a <= 5)));
    expect(await engine([lemma('areth'), lemma('ecis')], opts(5, { ordered: true }))).toBe(expected);
  }, 60000);
});
