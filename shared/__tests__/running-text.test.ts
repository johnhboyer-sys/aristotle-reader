// PR 9, running-text search: the engine over the file stage6 writes. The
// fixture is the pipeline's own output (pipeline/tests/fixtures/running_text.json,
// pinned by test_running_text.py), so both halves read the same bytes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  joinEnglish, runningPattern, runningView, RunningTimeoutError, searchRunningText, workerRunner,
  type MatchRunner, type RunningFile, type WorkerLike,
} from '../lib/running-text';
import { findMatches } from '../lib/running-match';
import type { Offsets, SearchOutcome, SegMeta } from '../lib/search';

const FIXTURE = JSON.parse(readFileSync(join(__dirname, './fixtures/running_text.json'), 'utf8')) as {
  running: RunningFile; offsets: Offsets; meta: SegMeta[];
};

// Int: a dialogue with no narrator, so a speaker filter can name its words.
// Prob's running text does not load.
let offsets: Offsets;
let served: Record<string, unknown>;
beforeEach(() => {
  offsets = structuredClone(FIXTURE.offsets);
  served = {};
  for (const w of ['Int', 'EN', 'Timaeus']) {
    served[`/data/${w}/search/running.json`] = FIXTURE.running;
    served[`/data/${w}/search/offsets.json`] = offsets;
    served[`/data/${w}/search/meta.json`] = FIXTURE.meta;
  }
  // Gorgias: the same text with turns, Socrates' from the start and Int's
  // from ὡς (global 21). Files are cached for the session, so a work's turns
  // are fixed here rather than changed by a test.
  served['/data/Gorgias/search/running.json'] = FIXTURE.running;
  served['/data/Gorgias/search/meta.json'] = FIXTURE.meta;
  served['/data/Gorgias/search/offsets.json'] = { ...offsets, turn_bounds: [
    { book: 1, speaker: 'Socrates', start: 0, accuracy: 'exact' },
    { book: 1, speaker: 'Int', start: 21, accuracy: 'exact' },
  ] };
  // Met: the same text in two books, 17b opening book 2 at global 16.
  served['/data/Meta/search/running.json'] = FIXTURE.running;
  served['/data/Meta/search/meta.json'] = [FIXTURE.meta[0], { ...FIXTURE.meta[1], id: '2:17b', book: 2 }];
  served['/data/Meta/search/offsets.json'] = {
    ...offsets,
    segments: [offsets.segments[0], { ...offsets.segments[1], book: 2 }],
    book_bounds: [{ book: 1, start: 0 }, { book: 2, start: 16 }],
  };
  served['/data/Prob/search/offsets.json'] = offsets;
  served['/data/Prob/search/meta.json'] = FIXTURE.meta;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    const body = served[String(url)];
    return (body ? { ok: true, status: 200, json: async () => structuredClone(body) } : { ok: false, status: 404, json: async () => ({}) }) as Response;
  });
});
afterEach(() => vi.restoreAllMocks());

const run = (pattern: string, opts: { accents?: boolean; punctuation?: boolean } = {}, works = ['Int'], speaker?: Parameters<typeof searchRunningText>[2]) =>
  searchRunningText({ pattern, accents: false, punctuation: false, ...opts }, works, speaker);
const hits = (o: SearchOutcome) => o.results.map(r => `${r.meta.column}:${r.grkPositions.join(',')}`);

describe('running text: the views', () => {
  it('strips marks for accents off and makes each gap one space for punctuation off', () => {
    const plain = runningView(FIXTURE.running, { accents: false, punctuation: false });
    expect(plain.text.startsWith('oti men umeis w andres aqhnaioi pepon')).toBe(true);
    const full = runningView(FIXTURE.running, { accents: true, punctuation: true });
    expect(full.text.startsWith('o(/ti me\\n u(mei=s, w)= a)/ndres')).toBe(true);
    for (const v of [plain, full]) {
      expect(v.starts.length).toBe(FIXTURE.offsets.token_count);
      expect(v.text.slice(v.starts[0], v.ends[0])).toMatch(/^o\(?\/?ti$/);
    }
  });
});

describe('running text: search', () => {
  it('matches across a word boundary and marks both words', async () => {
    // ὡς δοκεῖ: tokens 5 and 6 of 17b.
    const o = await run('ws dokei');
    expect(hits(o)).toEqual(['17b:5,6']);
    expect(o.results[0].windows).toEqual([[5, 6]]);
  });

  it('matches inside a word and marks the word that holds it, cited at its section', async () => {
    const o = await run('fignoe');
    expect(hits(o)).toEqual(['17b:1']);
    expect(o.results[0].meta).toEqual({ id: '1:17b', book: 1, column: '17b' });
  });

  it('runs across sections: cited where the match begins, every word it touches marked', async () => {
    // οὖν (17a, last word, 15) καὶ (17b, first): cited at 17a, καὶ counted on
    // from 17a's first word as 16, the window holding both.
    const o = await run('oun kai');
    expect(hits(o)).toEqual(['17a:15,16']);
    expect(o.results[0].windows).toEqual([[15, 16]]);
  });

  it('finds no match across a book break, and one that starts the next book', async () => {
    // οὖν (book 1's last word, 15) καὶ (book 2's first): no match at all
    // (John, 2026-11-11), where Int, one book, has it.
    expect(hits(await run('oun kai', {}, ['Meta']))).toEqual([]);
    expect(hits(await run('oun kai', {}, ['Int']))).toEqual(['17a:15,16']);
    // A match the break would have swallowed is found in book 2: καὶ there
    // is its first word, 17b:0.
    expect(hits(await run('(oun )?kai', {}, ['Meta']))[0]).toBe('17b:0');
  });

  it('matches punctuation only with the switch on, and ignores it with the switch off', async () => {
    expect(hits(await run('aqhnaioi, pep', { punctuation: true }))).toEqual(['17a:5,6']);
    expect(hits(await run('aqhnaioi, pep'))).toEqual([]);
    expect(hits(await run('aqhnaioi pep'))).toEqual(['17a:5,6']);
    expect(hits(await run('aqhnaioi pep', { punctuation: true }))).toEqual([]);
    // The raised dot is typed as · or :, a question mark as ;.
    expect(hits(await run('oida· egw', { punctuation: true }))).toEqual(['17a:12,13']);
    expect(hits(await run('dh;', { punctuation: true }))).toEqual(['17b:3']);
  });

  it('reads a typed ’ after a stop or a space as a quote mark, and after a word as the elision', async () => {
    // λέγεις;’ ἔφη: the writer keeps the closing ’ as ", and so does the query.
    expect(runningPattern('λέγεις;’', false)!.source).toBe('legeis;"');
    expect(hits(await run('λέγεις;’', { punctuation: true }))).toEqual(['17b:8']);
    expect(hits(await run('λέγεις;’ ἔφη', { punctuation: true }))).toEqual(['17b:8,9']);
    // At the start, an opening quote: "Τί δή;" in 17b.
    expect(hits(await run('’τί', { punctuation: true }))).toEqual(['17b:2']);
    // δ’ οὖν: an elision, as greekFold reads it.
    expect(hits(await run('δ’ οὖν', { punctuation: true }))).toEqual(['17a:14,15']);
    expect(hits(await run('δ’ οὖν'))).toEqual(['17a:14,15']);
  });

  it('keeps the punctuation of a line with no words', async () => {
    // 17b's third line is a lone dash, between δοκεῖ. and τί.
    expect(hits(await run('δοκεῖ\\. — τί', { punctuation: true }))).toEqual(['17b:6,7']);
  });

  it('reads Greek and Beta Code alike, and a regular expression over the text', async () => {
    expect(hits(await run('ὡς δοκεῖ'))).toEqual(['17b:5,6']);
    expect(hits(await run('WS DOKEI'))).toEqual(['17b:5,6']);
    expect(hits(await run('(ws|oti) [a-z]+'))).toEqual(['17a:0,1', '17b:5,6']);
  });

  it('holds accents exactly with the switch on', async () => {
    expect(hits(await run('ὡς δοκεῖ', { accents: true }))).toEqual(['17b:5,6']);
    expect(hits(await run('ὧς', { accents: true }))).toEqual([]);
    // Unaccented letters match only unaccented ones.
    expect(hits(await run('ws dokei', { accents: true }))).toEqual([]);
    expect(hits(await run('dokei=', { accents: true }))).toEqual(['17b:6']);
    // . and a class take a letter with whatever marks it has.
    expect(hits(await run('ὡ. δ.κ.ῖ', { accents: true }))).toEqual(['17b:5,6']);
    expect(hits(await run('[^ ]+ δοκεῖ', { accents: true }))).toEqual(['17b:5,6']);
  });

  it('refuses a pattern it cannot read', async () => {
    expect(runningPattern('ws(', false)).toBeNull();
    expect(runningPattern('  ', false)).toBeNull();
    await expect(run('ws(')).rejects.toThrow('Not a pattern');
  });

  it('keeps a match whose first word a wanted speaker says, and names the speaker', async () => {
    const only = (names: string[]) => run('ws dokei|oti men', {}, ['Gorgias'], { mode: 'only', names });
    let o = await only(['Int']);
    expect(hits(o)).toEqual(['17b:5,6']);
    expect(o.results[0].speakers).toEqual(['Int', 'Int']);
    o = await only(['Socrates']);
    expect(hits(o)).toEqual(['17a:0,1']);
    o = await run('ws dokei|oti men', {}, ['Gorgias'], { mode: 'except', names: ['Socrates'] });
    expect(hits(o)).toEqual(['17b:5,6']);
    // A work with no turns has no one to name: left out under a filter.
    o = await run('ws dokei|oti men', {}, ['Int', 'Gorgias'], { mode: 'only', names: ['Int'] });
    expect(hits(o)).toEqual(['17b:5,6']);
  });

  it('reports a work whose running text does not load, and keeps the others', async () => {
    const o = await run('ws dokei', {}, ['Int', 'Prob', 'EN']);
    expect(o.failedWorks).toEqual(['Prob']);
    expect(o.results.map(r => r.work)).toEqual(['Int', 'EN']);
    await expect(run('ws dokei', {}, ['Prob'])).rejects.toThrow('Could not load');
  });

  it('reports progress work by work', async () => {
    const seen: string[] = [];
    await searchRunningText({ pattern: 'ws', accents: false, punctuation: false }, ['Int', 'EN', 'Timaeus'], undefined,
      (done, total) => seen.push(`${done}/${total}`));
    expect(seen).toEqual(['0/3', '1/3', '2/3', '3/3']);
  });

  it('joins an English search by section, both or either', () => {
    const grk: SearchOutcome = { results: [
      { work: 'Int', meta: FIXTURE.meta[1], grkMatch: true, engMatch: false, grkPositions: [5] },
    ], failedWorks: [] };
    const eng: SearchOutcome = { results: [
      { work: 'Int', meta: FIXTURE.meta[0], grkMatch: false, engMatch: true, engHits: [{ translation: 'cooke', positions: [1] }], grkPositions: [] },
      { work: 'Int', meta: FIXTURE.meta[1], grkMatch: false, engMatch: true, engHits: [{ translation: 'cooke', positions: [2] }], grkPositions: [] },
    ], failedWorks: [] };
    const both = joinEnglish(grk, eng, 'and');
    expect(both.results).toEqual([{ ...grk.results[0], engMatch: true, engHits: eng.results[1].engHits }]);
    expect(joinEnglish(grk, eng, 'or').results.map(r => r.meta.column)).toEqual(['17a', '17b']);
  });
});

describe('running text: the matcher and its time limit', () => {
  it('lists each match as a span, and steps past a match of nothing', () => {
    expect([...findMatches('abcab', /ab/g)]).toEqual([0, 2, 3, 5]);
    expect([...findMatches('abc', /x*/g)]).toEqual([]);
    expect([...findMatches('axb', /x*/g)]).toEqual([1, 2]);
  });

  it('matches each stretch between two cuts on its own', () => {
    expect([...findMatches('ab ab', /b a/g)]).toEqual([1, 4]);
    expect([...findMatches('ab ab', /b a/g, [3])]).toEqual([]);
    expect([...findMatches('ab ab', /a/g, [3])]).toEqual([0, 1, 3, 4]);
  });

  // A worker that never answers, as (a+)+b over the Pol.
  const silent = () => {
    const made: (WorkerLike & { posted: number; ended: boolean })[] = [];
    const make = () => {
      const w = { onmessage: null, onerror: null, posted: 0, ended: false,
        postMessage() { w.posted++; }, terminate() { w.ended = true; } };
      made.push(w);
      return w;
    };
    return { made, make };
  };

  it('ends a worker that runs past the limit, and the search with it', async () => {
    vi.useFakeTimers();
    try {
      const { made, make } = silent();
      const runner = workerRunner(make, 3000);
      const first = runner.run('aaaa', /(a+)+b/g);
      const second = runner.run('aaaa', /(a+)+b/g);
      const firstErr = expect(first).rejects.toBeInstanceOf(RunningTimeoutError);
      const secondErr = expect(second).rejects.toThrow('Pattern took too long');
      await vi.advanceTimersByTimeAsync(3000);
      await firstErr;
      await secondErr;
      expect(made.length).toBe(1);
      expect(made[0].ended).toBe(true);
      // The next search, a fresh runner: a fresh worker.
      workerRunner(make, 3000).run('a', /a/g).catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(made.length).toBe(2);
      expect(made[1].posted).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers with the worker\'s spans when it finishes in time', async () => {
    const make = () => {
      const w: WorkerLike = { onmessage: null, onerror: null, terminate() {},
        postMessage(msg) {
          const { text, source, flags } = msg as { text: string; source: string; flags: string };
          queueMicrotask(() => w.onmessage!({ data: { ok: true, spans: findMatches(text, new RegExp(source, flags)) } } as MessageEvent));
        } };
      return w;
    };
    expect([...await workerRunner(make).run('abab', /b/g)]).toEqual([1, 2, 3, 4]);
  });

  // A worker that errs before it answers: one whose script did not load.
  const broken = () => {
    const w: WorkerLike = { onmessage: null, onerror: null, terminate() {},
      postMessage() { queueMicrotask(() => w.onerror!({ preventDefault() {} } as ErrorEvent)); } };
    return w;
  };

  it('matches in this thread when the worker cannot start, and says nothing of time', async () => {
    const q = { pattern: 'ws dokei', accents: false, punctuation: false };
    let o = await searchRunningText(q, ['Int', 'EN'], undefined, undefined, () => workerRunner(broken, 3000));
    expect(o.failedWorks).toEqual([]);
    expect(hits(o)).toEqual(['17b:5,6', '17b:5,6']);
    o = await searchRunningText(q, ['Int'], undefined, undefined, () => workerRunner(() => { throw new Error('no workers'); }, 3000));
    expect(hits(o)).toEqual(['17b:5,6']);
  });

  it('gives the bad-pattern message for a pattern the worker cannot read', async () => {
    await import('../lib/running-text.worker');
    const posted: unknown[] = [];
    vi.spyOn(self, 'postMessage').mockImplementation((msg: unknown) => { posted.push(msg); });
    (self.onmessage as (e: MessageEvent) => void)({ data: { text: 'a', source: '(', flags: 'g' } } as MessageEvent);
    expect(posted[0]).toMatchObject({ ok: false, pattern: true });
    const refuses = () => {
      const w: WorkerLike = { onmessage: null, onerror: null, terminate() {},
        postMessage() { queueMicrotask(() => w.onmessage!({ data: posted[0] } as MessageEvent)); } };
      return w;
    };
    await expect(searchRunningText({ pattern: 'ws', accents: false, punctuation: false }, ['Int', 'EN'], undefined, undefined,
      () => workerRunner(refuses, 3000))).rejects.toThrow('Not a pattern the search can read.');
  });

  it('reports a pattern that took too long, not a work that failed', async () => {
    let disposed = 0;
    const timesOut = (): MatchRunner => ({ run: async () => { throw new RunningTimeoutError(); }, dispose: () => { disposed++; } });
    await expect(searchRunningText({ pattern: '(a+)+b', accents: false, punctuation: false }, ['Int', 'EN'], undefined, undefined, timesOut))
      .rejects.toThrow('Pattern took too long');
    expect(disposed).toBe(1);
  });
});
