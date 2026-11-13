// Saved searches (PR 8, ruling 4): the store module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVED_KEY, addSaved, deleteSaved, exportSaved, findSaved, importSaved, isSafeUrl,
  listSaved, noteSaved, renameSaved, savedAvailable, summarizeSearch,
} from '../lib/saved-searches';

const REP = `/search?g=${encodeURIComponent('δικαιοσύνη')}&w=Pol`;
const SOC = `/search?g=${encodeURIComponent('ψυχή')}&sp=only&sn=Socrates`;

// As a full store: reads work, every write throws QuotaExceededError.
function fill() {
  const real = window.localStorage;
  const full = {
    getItem: (k: string) => real.getItem(k),
    removeItem: (k: string) => real.removeItem(k),
    setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
  } as unknown as Storage;
  vi.spyOn(window, 'localStorage', 'get').mockReturnValue(full);
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

// As a browser that blocks site data: touching localStorage throws.
function block() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
}

describe('saved-searches store', () => {
  it('saves a URL with a readable name, the date and an empty note', () => {
    const e = addSaved(REP, undefined, new Date('2026-11-10T12:00:00Z'))!;
    expect(e).toMatchObject({ url: REP, name: 'δικαιοσύνη · in Pol', note: '', date: '2026-11-10T12:00:00.000Z' });
    expect(listSaved()).toEqual([e]);
    expect(JSON.parse(localStorage.getItem(SAVED_KEY)!)).toHaveLength(1);
  });

  it('saves an identical URL once', () => {
    const a = addSaved(REP)!;
    expect(addSaved(REP)!.id).toBe(a.id);
    expect(listSaved()).toHaveLength(1);
    expect(findSaved(REP)?.id).toBe(a.id);
    expect(findSaved(SOC)).toBeUndefined();
  });

  it('opens: the entry gives back the exact URL it saved, speaker filter included', () => {
    addSaved(SOC);
    const e = listSaved()![0];
    expect(e.url).toBe(SOC);
    const p = new URL(e.url, 'https://plato.johnhboyer.com').searchParams;
    expect([p.get('sp'), p.get('sn')]).toEqual(['only', 'Socrates']);
    expect(e.name).toBe('ψυχή · spoken by Socrates');
  });

  it('renames, notes and deletes', () => {
    const e = addSaved(REP)!;
    expect(renameSaved(e.id, '  Justice in the Pol ')).toBe(true);
    expect(renameSaved(e.id, '   ')).toBe(false);
    expect(noteSaved(e.id, 'for Tuesday')).toBe(true);
    expect(listSaved()![0]).toMatchObject({ name: 'Justice in the Pol', note: 'for Tuesday', url: REP });
    expect(deleteSaved(e.id)).toBe(true);
    expect(listSaved()).toEqual([]);
    expect(deleteSaved(e.id)).toBe(false);
  });

  it('exports, then imports into a cleared store', () => {
    addSaved(REP);
    addSaved(SOC);
    renameSaved(listSaved()![0].id, 'Soul, Socrates');
    noteSaved(listSaved()![0].id, 'a note');
    const before = listSaved()!;
    const file = exportSaved(before);
    localStorage.clear();
    expect(importSaved(file)).toEqual({ imported: 2, skipped: 0 });
    const after = listSaved()!;
    const strip = (l: typeof after) => l.map(({ id: _id, ...rest }) => rest);
    expect(strip(after)).toEqual(strip(before));
    // Importing the same file again adds nothing.
    expect(importSaved(file)).toEqual({ imported: 0, skipped: 2 });
  });

  it('skips bad entries of an import and refuses a malformed file', () => {
    const file = JSON.stringify({ searches: [
      { url: REP, name: 'ok', note: '', date: '2026-11-10T00:00:00Z' },
      { url: 'javascript:alert(1)', name: 'bad' },
      { url: '//evil.example/search?g=x', name: 'off-site' },
      { name: 'no url' },
      'a string',
      null,
    ] });
    expect(importSaved(file)).toEqual({ imported: 1, skipped: 5 });
    expect(listSaved()!.map((e) => e.name)).toEqual(['ok']);
    expect(importSaved('not json')).toBeNull();
    expect(importSaved('{"other": 1}')).toBeNull();
    expect(listSaved()).toHaveLength(1);
  });

  it('a blocked store: unavailable, and no call throws', () => {
    block();
    expect(savedAvailable()).toBe(false);
    expect(listSaved()).toBeNull();
    expect(addSaved(REP)).toBeNull();
    expect(findSaved(REP)).toBeUndefined();
    expect(renameSaved('x', 'y')).toBe(false);
    expect(importSaved('[]')).toBeNull();
  });

  it('accepts same-site paths only', () => {
    expect(isSafeUrl('/search?g=x')).toBe(true);
    expect(isSafeUrl('https://evil.example/')).toBe(false);
    expect(isSafeUrl('//evil.example/')).toBe(false);
    expect(isSafeUrl('/\\evil.example')).toBe(false);
  });

  it('names a search from its query, speakers and works', () => {
    expect(summarizeSearch('/search?g=λόγος&e=reason&op=or')).toBe('λόγος or reason');
    expect(summarizeSearch('/search?g=ψυχή&sp=except&sn=Socrates,Glaucon&w=-Meta,EE'))
      .toBe('ψυχή · not spoken by Socrates, Glaucon · not in Meta, EE');
    expect(summarizeSearch('/search?c=f:λόγος&c=la:logos')).toBe('logos after λόγος as typed, within 5 words');
    expect(summarizeSearch('/search')).toBe('Search');
  });
});

// Finding 5 of Codex's review R8: a proximity search is named with the
// sentence the page shows (proximity-sentence.ts), relations and distance
// included, never "near" for every term.
describe('a saved proximity search\'s name', () => {
  const heads = (k: string) => ({ areth: 'ἀρετή', hdonh: 'ἡδονή', luph: 'λύπη', ecis: 'ἕξις' } as Record<string, string>)[k] ?? k;
  it('says each relation and the distance', () => {
    expect(summarizeSearch('/search?c=l:areth&c=lb:hdonh&cw=10', heads)).toBe('ἡδονή before ἀρετή, within 10 words');
    expect(summarizeSearch('/search?c=l:areth&c=ln:luph&cw=10', heads)).toBe('λύπη not near ἀρετή, within 10 words');
    expect(summarizeSearch('/search?c=l:areth&c=l:ecis&c=lb:hdonh&cu=line', heads)).toBe('ἕξις near ἀρετή, ἡδονή before ἀρετή, in the same line');
    expect(summarizeSearch('/search?c=l:areth&c=l:ecis&co=1', heads)).toBe('ἕξις near ἀρετή, within 5 words, in this order');
  });
  it('keeps the speaker, and takes the works as the page words them', () => {
    expect(summarizeSearch('/search?c=l:areth&c=l:ecis&w=auth', heads, 'authentic works'))
      .toBe('ἕξις near ἀρετή, within 5 words, in authentic works');
    expect(summarizeSearch('/search?c=l:areth&c=l:ecis&sp=only&sn=Socrates', heads))
      .toBe('ἕξις near ἀρετή, within 5 words · spoken by Socrates');
  });
});

describe('saved-searches review fixes', () => {
  it('equal searches are one entry: q vs e, reordered params, + vs %20, trailing &', () => {
    const a = addSaved('/search?q=soul')!;
    expect(a.url).toBe('/search?e=soul');
    expect(a.name).toBe('soul');
    expect(findSaved('/search?e=soul')?.id).toBe(a.id);
    expect(addSaved('/search?e=soul')!.id).toBe(a.id);
    const b = addSaved('/search?e=the%20soul&em=phrase')!;
    for (const same of ['/search?em=phrase&e=the+soul', '/search?e=the+soul&em=phrase&']) {
      expect(findSaved(same)?.id).toBe(b.id);
      expect(addSaved(same)!.id).toBe(b.id);
    }
    expect(listSaved()).toHaveLength(2);
    // An import of the same search under another spelling adds nothing.
    expect(importSaved(JSON.stringify([{ url: '/search?em=phrase&e=the+soul&' }]))).toEqual({ imported: 0, skipped: 1 });
  });

  it('a full store still lists, and a save into it fails', () => {
    addSaved(REP);
    fill();
    expect(savedAvailable()).toBe(true);
    expect(listSaved()!.map((e) => e.url)).toEqual([REP]);
    expect(addSaved(SOC)).toBeNull();
    expect(importSaved(JSON.stringify([{ url: SOC }]))).toBe('full');
    expect(listSaved()).toHaveLength(1);
  });
});
