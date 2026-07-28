import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Phrases from '../components/Phrases.svelte';
import type { NgramRow } from '../lib/data';

// τὸ τί ἦν εἶναι is stored in the dictionary-form index as ὁ τίς εἰμί εἰμί, and
// ἦν is genuinely ambiguous — Morpheus reads it as εἰμί, ἠμί and ἤν among
// others, so not every reading of the typed phrase is a phrase that recurs.
//
// A dictionary form is always among its own headwords, because it is a form that
// occurs: ὁ maps to ὁ and ὅ. τό maps only to ὁ — it is no headword itself.
const lemmaMap: Record<string, Record<string, string[]>> = {
  t: { to: ['o'], ti: ['tis'], tis: ['tis'] },
  h: { hn: ['eimi', 'hmi', 'hn'], h: ['o'] },
  e: { einai: ['eimi'], eimi: ['eimi'] },
  o: { o: ['o', 'os'] },
};

const shards: Record<string, Record<string, NgramRow>> = {
  'lemma/o': {
    'o tis eimi eimi': [4, 127, 629.8, 10],
    'o tis hmi eimi': [4, 123, 1239.8, 9],
    'o tis eimi': [3, 336, 416.4, 17],
  },
  'lemma/h': { 'hn eimi': [2, 9, 4.5, 3] },
  'lemma/e': { 'eimi tis': [2, 12, 3.1, 4] },
  'lemma/k': { 'kata sumbebhkos': [2, 330, 900.1, 20] },
  'form/t': { 'to ti hn einai': [4, 103, 1611.9, 8] },
  'form/k': { 'kata sumbebhkos': [2, 330, 900.1, 20] },
};

// The shard and occurrence fetchers cache per letter for the life of the
// module, which is right in a browser and useless in a test: the second test
// would see no request at all. Mock them instead of the network, and record
// what each render actually asked for.
const { shardCalls, occCalls } = vi.hoisted(() => ({
  shardCalls: [] as string[],
  occCalls: [] as string[],
}));

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchNgramShard: vi.fn(async (stream: string, letter: string) => {
      shardCalls.push(`${stream}/${letter}`);
      return shards[`${stream}/${letter}`] ?? {};
    }),
    fetchNgramOccurrences: vi.fn(async (stream: string, letter: string, n: number) => {
      occCalls.push(`${stream}/${letter}-${n}`);
      return { 'o tis eimi eimi': { Meta: [90000] } };
    }),
  };
});

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
}

// The Greek the page prints is the fold turned back into letters, so it carries
// no accents — ὁ τίς εἰμί εἰμί appears as ο τις ειμι ειμι. Asserting on the
// accented spelling would be asserting on a phrase the page never shows.
const GREEK = {
  toTiHnEinai: 'ο τις ειμι ειμι',
  hmiReading: 'ο τις ημι ειμι',
  hnReading: 'ο τις ην ειμι',
  oTisEimi: 'ο τις ειμι',
  hnEimi: 'ην ειμι',
  surface: 'το τι ην ειναι',
};

// A phrase can appear twice on the page — once as a row, once named in the note
// under the box — so a row is looked up by its own class.
function findRow(greek: string) {
  return screen.findByText(greek, { selector: '.phrase-greek' });
}

// Pick the dictionary-form stream, then type, so the widening runs against a
// settled query.
async function typeInLemmaMode(text: string) {
  const view = render(Phrases);
  await fireEvent.click(screen.getByRole('radio', { name: 'Word in any of its forms' }));
  await fireEvent.input(screen.getByRole('searchbox'), { target: { value: text } });
  await vi.waitFor(() => expect(shardCalls.length).toBeGreaterThan(0));
  return view;
}

describe('Phrases: the dictionary-form index takes the form on the page', () => {
  beforeEach(() => {
    shardCalls.length = 0;
    occCalls.length = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const path = String(url);
      const map = path.match(/lemma-map\/([a-z_])\.json$/);
      if (map) return json(lemmaMap[map[1]] ?? {});
      if (path.endsWith('offsets.json')) {
        return json({
          books: [0],
          book_bounds: [{ book: 1, start: 0 }],
          chapter_bounds: [],
          columns: [{ column: '1028b', start: 90000, lines: [{ line: 1, start: 90000 }] }],
        });
      }
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  // The defect: the index is keyed on headwords, so the phrase a reader has in
  // front of them matched nothing typed literally — τό is not a headword, ὁ is.
  it('finds the phrase typed as it stands on the page', async () => {
    await typeInLemmaMode('to ti hn einai');
    expect(await findRow(GREEK.toTiHnEinai)).toBeInTheDocument();
  });

  it('reads the shard a reading lives in, not the typed letter', async () => {
    await typeInLemmaMode('to ti hn einai');
    await findRow(GREEK.toTiHnEinai);
    // τό resolves to ὁ, so the row is in the O shard — and the T shard is never
    // fetched, because τό is no headword and reading it literally would cost a
    // 3.3 MB shard with nothing in it.
    expect(shardCalls).toContain('lemma/o');
    expect(shardCalls).not.toContain('lemma/t');
  });

  // Half-typed words are the common case while a reader is still typing, and the
  // map records none of them.
  it('matches a word the map does not record as typed', async () => {
    await typeInLemmaMode('o tis eim');
    expect(await findRow(GREEK.oTisEimi)).toBeInTheDocument();
  });

  // Which shards are wanted turns on the FIRST word: ἦν is the surface of εἰμί
  // and ἠμί, whose phrases are filed under different letters.
  it('reads every shard when the first word is ambiguous', async () => {
    await typeInLemmaMode('hn ti');
    expect(await findRow('ειμι τις')).toBeInTheDocument();
    expect(shardCalls).toContain('lemma/h');
    expect(shardCalls).toContain('lemma/e');
  });

  it('names the readings that matched, and only those', async () => {
    await typeInLemmaMode('to ti hn einai');
    const note = await screen.findByText(/Reading these words as/);
    expect(note.textContent).toContain(GREEK.toTiHnEinai);
    expect(note.textContent).toContain(GREEK.hmiReading);
    // ἦν read as ἤν is a real reading, but no such phrase recurs, so claiming
    // it matched would be a lie.
    expect(note.textContent).not.toContain(GREEK.hnReading);
  });

  it('still matches a dictionary form typed as one', async () => {
    await typeInLemmaMode('o tis eimi');
    expect(await findRow(GREEK.oTisEimi)).toBeInTheDocument();
  });

  // The letter buttons type into the same box. h is the surface of ἡ, whose
  // headword is ὁ, so widening one letter would silently move the browse.
  it('does not widen a single letter', async () => {
    await typeInLemmaMode('h');
    expect(await findRow(GREEK.hnEimi)).toBeInTheDocument();
    expect(shardCalls).not.toContain('lemma/o');
  });

  it("fetches a row's occurrences from the shard that holds it", async () => {
    await typeInLemmaMode('to ti hn einai');
    await fireEvent.click(await findRow(GREEK.toTiHnEinai));
    // Not lemma/o-4 by luck of the typed letter: t is what was typed, o is
    // where the row lives.
    await vi.waitFor(() => expect(occCalls).toContain('lemma/o-4'));
  });

  it('leaves the surface stream matching what was typed', async () => {
    render(Phrases);
    await fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'to ti hn einai' },
    });
    expect(await findRow(GREEK.surface)).toBeInTheDocument();
    expect(shardCalls).toContain('form/t');
    const requested = vi.mocked(globalThis.fetch).mock.calls.map((c) => String(c[0]));
    expect(requested.filter((p) => p.includes('lemma-map'))).toHaveLength(0);
  });
});
