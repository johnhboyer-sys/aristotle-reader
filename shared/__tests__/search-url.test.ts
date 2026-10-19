import { describe, expect, it } from 'vitest';
import { decodeSearchUrl, emptyUrlSearch, encodeSearchUrl, hasSearch, type UrlSearch } from '../lib/search-url';
import { WORKS } from '../lib/works';

const ALL = WORKS.map(w => w.id);
const base = (over: Partial<UrlSearch> = {}): UrlSearch => ({ ...emptyUrlSearch(ALL), ...over });
const roundTrip = (s: UrlSearch) => decodeSearchUrl(encodeSearchUrl(s, ALL), ALL);

describe('search URL', () => {
  it('writes nothing for an empty search, and reads it back as none', () => {
    expect(encodeSearchUrl(base(), ALL)).toBe('');
    expect(hasSearch(decodeSearchUrl('', ALL))).toBe(false);
  });

  it('leaves out every default', () => {
    expect(encodeSearchUrl(base({ grk: 'λόγος' }), ALL)).toBe(`g=${encodeURIComponent('λόγος')}`);
    expect(encodeSearchUrl(base({ eng: 'virtue' }), ALL)).toBe('e=virtue');
  });

  it('reads the command palette hand-off unchanged', () => {
    // CommandPalette builds `/search?g=` or `?e=` with encodeURIComponent.
    expect(decodeSearchUrl(`?g=${encodeURIComponent('τὸ τί ἦν εἶναι')}`, ALL))
      .toEqual(base({ grk: 'τὸ τί ἦν εἶναι' }));
    expect(decodeSearchUrl(`?e=${encodeURIComponent('practical wisdom')}`, ALL))
      .toEqual(base({ eng: 'practical wisdom' }));
  });

  it('reads the SearchAction ?q= as Greek when it is Greek script, else English', () => {
    // search.astro's JSON-LD advertises /search/?q={search_term_string}.
    expect(decodeSearchUrl('?q=happiness', ALL)).toEqual(base({ eng: 'happiness' }));
    expect(decodeSearchUrl(`?q=${encodeURIComponent('εὐδαιμονία')}`, ALL))
      .toEqual(base({ grk: 'εὐδαιμονία' }));
    // Beta Code reads the same as English, so Latin letters go to English.
    expect(decodeSearchUrl('?q=logos', ALL)).toEqual(base({ eng: 'logos' }));
    expect(hasSearch(decodeSearchUrl('?q=happiness', ALL))).toBe(true);
  });

  it('lets ?g= and ?e= outrank ?q=', () => {
    expect(decodeSearchUrl('?q=happiness&e=virtue', ALL)).toEqual(base({ eng: 'virtue' }));
    expect(decodeSearchUrl(`?q=happiness&g=${encodeURIComponent('λόγος')}`, ALL))
      .toEqual(base({ grk: 'λόγος' }));
    expect(hasSearch(decodeSearchUrl('?q=%20', ALL))).toBe(false);
  });

  it('round-trips every option of a plain search', () => {
    const s = base({
      grk: 'fron*', eng: 'virtue of character', grkMode: 'phrase', engMode: 'any',
      matchMode: 'form', accent: true, langOp: 'or', works: ['EN', 'EE', 'Pol'], trans: 'ross',
    });
    expect(roundTrip(s)).toEqual(s);
    const qs = encodeSearchUrl(s, ALL);
    expect(qs).toContain('gm=phrase');
    expect(qs).toContain('w=EN,EE,Pol');
  });

  it('writes only the options the search used', () => {
    // No Greek: Greek match, accents and both/either say nothing.
    const qs = encodeSearchUrl(base({ eng: 'soul', grkMode: 'any', matchMode: 'form', accent: true, langOp: 'or' }), ALL);
    expect(qs).toBe('e=soul');
    // No English: a translator filter has nothing to narrow.
    expect(encodeSearchUrl(base({ grk: 'yuxh', trans: 'ross' }), ALL)).toBe('g=yuxh');
  });

  it('lists the works left out when that is shorter, and omits all', () => {
    const allBut = ALL.filter(id => id !== 'Cat' && id !== 'Int');
    expect(encodeSearchUrl(base({ grk: 'a', works: allBut }), ALL)).toBe('g=a&w=-Cat,Int');
    expect(encodeSearchUrl(base({ grk: 'a', works: [...ALL].reverse() }), ALL)).toBe('g=a');
    expect(roundTrip(base({ grk: 'a', works: allBut })).works).toEqual(allBut);
  });

  it('keeps an empty selection empty rather than reading it as all', () => {
    expect(roundTrip(base({ grk: 'a', works: [] })).works).toEqual([]);
  });

  it('drops unknown works and bad values for their defaults', () => {
    const s = decodeSearchUrl('?g=a&gm=nonsense&em=&m=headword&op=xor&w=EN,Nope&cw=3', ALL);
    expect(s).toEqual(base({ grk: 'a', works: ['EN'] }));
  });

  it('round-trips a single-lemma search with its English side', () => {
    const s = base({ lemmas: ['logos', 'areth'], eng: 'reason', langOp: 'or' });
    expect(roundTrip(s)).toEqual(s);
    expect(encodeSearchUrl(s, ALL)).toBe('l=logos,areth&e=reason&op=or');
  });

  it('round-trips a proximity search, and it supersedes the boxes', () => {
    const s = base({
      combo: {
        slots: [
          { kind: 'lemma', relation: 'near', text: '', picked: ['logos'], grammar: {} },
          { kind: 'form', relation: 'after', text: 'ἀρετή', picked: [], grammar: {} },
          { kind: 'grammatical', relation: 'before', text: '', picked: [], grammar: { case: 'gen', number: 'pl' } },
          { kind: 'phrase', relation: 'near', text: 'τί ἦν: εἶναι', picked: [], grammar: {} },
        ],
        window: 12, unit: 'words', ordered: true, crossChapter: false,
      },
    });
    expect(roundTrip(s)).toEqual(s);
    const qs = encodeSearchUrl({ ...s, grk: 'ignored', eng: 'ignored' }, ALL);
    expect(qs).not.toMatch(/(^|&)[ge]=/);
    expect(qs).toContain('c=l:logos&c=fa:');
    expect(qs).toContain('c=gb:case.gen,number.pl');
    expect(qs).toContain('cw=12&co=1&cx=0');
  });

  it('needs two usable proximity slots to read a proximity search', () => {
    expect(decodeSearchUrl('?c=f:logos', ALL).combo).toBeNull();
    expect(decodeSearchUrl('?c=f:logos&c=l:&c=x:junk', ALL).combo).toBeNull();
    expect(decodeSearchUrl('?c=f:logos&c=l:areth&cw=500', ALL).combo?.window).toBe(50);
  });

  it('reads the window back as the box clamps it, fractions included', () => {
    // The window box accepts 2.5 and the encoder writes it; reading it back as
    // the default 5 would change the search on reload.
    const win = (cw: string) => decodeSearchUrl(`?c=f:a&c=f:b&cw=${cw}`, ALL).combo?.window;
    expect(win('2.5')).toBe(2.5);
    expect(win('0.5')).toBe(1);
    expect(win('abc')).toBe(5);
  });

  it('writes ef=0 only for an English search matched as typed', () => {
    expect(encodeSearchUrl(base({ eng: 'virtue', engForms: false }), ALL)).toBe('e=virtue&ef=0');
    // Any form is the default, and is left out.
    expect(encodeSearchUrl(base({ eng: 'virtue' }), ALL)).toBe('e=virtue');
    // No English: there is nothing for it to match.
    expect(encodeSearchUrl(base({ grk: 'a', engForms: false }), ALL)).toBe('g=a');
    expect(roundTrip(base({ eng: 'virtue', engForms: false }))).toEqual(base({ eng: 'virtue', engForms: false }));
    expect(decodeSearchUrl('?e=virtue', ALL).engForms).toBe(true);
    expect(decodeSearchUrl('?e=virtue&ef=1', ALL).engForms).toBe(true);
  });

  it('writes the works filter, and reads it back', () => {
    expect(encodeSearchUrl(base({ grk: 'a', workFilter: 'Pol' }), ALL)).toBe('g=a&wf=Pol');
    expect(roundTrip(base({ eng: 'soul', workFilter: 'EN', works: ['EN', 'Pol'] })))
      .toEqual(base({ eng: 'soul', workFilter: 'EN', works: ['EN', 'Pol'] }));
    // No search: nothing to narrow.
    expect(encodeSearchUrl(base({ workFilter: 'Pol' }), ALL)).toBe('');
    expect(decodeSearchUrl('?g=a', ALL).workFilter).toBeNull();
    expect(decodeSearchUrl('?g=a&wf=Nope', ALL).workFilter).toBeNull();
  });

  it('leaves commas and colons bare and still encodes the rest', () => {
    const qs = encodeSearchUrl(base({ eng: 'virtue, & vice: 1' }), ALL);
    expect(qs).toBe('e=virtue,%20%26%20vice:%201');
    expect(decodeSearchUrl(qs, ALL).eng).toBe('virtue, & vice: 1');
  });
});
