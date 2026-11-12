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
    // Present but empty still outranks: the search is then empty.
    for (const qs of ['?q=happiness&g=', '?q=happiness&e=', '?q=happiness&g=%20', '?q=happiness&e=%20']) {
      expect(hasSearch(decodeSearchUrl(qs, ALL))).toBe(false);
    }
  });

  it('sends ?q= to Greek only for Greek letters, not Greek punctuation or Coptic', () => {
    // U+037E is the Greek question mark; U+0387 the ano teleia; U+03E2 Coptic shei.
    expect(decodeSearchUrl('?q=virtue%CD%BE', ALL)).toEqual(base({ eng: 'virtue\u037e' }));
    expect(decodeSearchUrl('?q=virtue%CE%87', ALL)).toEqual(base({ eng: 'virtue\u0387' }));
    expect(decodeSearchUrl('?q=%CF%A2', ALL)).toEqual(base({ eng: '\u03e2' }));
    // Monotonic, and decomposed polytonic, are still Greek.
    expect(decodeSearchUrl(`?q=${encodeURIComponent('λόγος')}`, ALL)).toEqual(base({ grk: 'λόγος' }));
    const nfd = 'εὐδαιμονία'.normalize('NFD');
    expect(decodeSearchUrl(`?q=${encodeURIComponent(nfd)}`, ALL)).toEqual(base({ grk: nfd }));
  });

  it('round-trips every option of a plain search', () => {
    const s = base({
      grk: 'fron*', eng: 'virtue of character', grkMode: 'phrase', engMode: 'any',
      matchMode: 'form', accent: true, langOp: 'or', works: ['Int', 'Meta', 'EN'], trans: 'ross',
    });
    expect(roundTrip(s)).toEqual(s);
    const qs = encodeSearchUrl(s, ALL);
    expect(qs).toContain('gm=phrase');
    expect(qs).toContain('w=Int,Meta,EN');
  });

  it('writes only the options the search used', () => {
    // No Greek: Greek match, accents and both/either say nothing.
    const qs = encodeSearchUrl(base({ eng: 'soul', grkMode: 'any', matchMode: 'form', accent: true, langOp: 'or' }), ALL);
    expect(qs).toBe('e=soul');
    // No English: a translator filter has nothing to narrow.
    expect(encodeSearchUrl(base({ grk: 'yuxh', trans: 'ross' }), ALL)).toBe('g=yuxh');
  });

  // Case exact (PR 6): written only when on, and only beside a Greek query,
  // as acc is; read back as it was written.
  it('round-trips case exact as cs=1, written only when on and only with Greek', () => {
    const s = base({ grk: 'Σωκράτης', caseExact: true });
    expect(encodeSearchUrl(s, ALL)).toBe(`g=${encodeURIComponent('Σωκράτης')}&cs=1`);
    expect(roundTrip(s)).toEqual(s);
    expect(encodeSearchUrl(base({ grk: 'Σωκράτης' }), ALL)).not.toContain('cs=');
    expect(decodeSearchUrl(`?g=a`, ALL).caseExact).toBe(false);
    expect(encodeSearchUrl(base({ eng: 'Socrates', caseExact: true }), ALL)).toBe('e=Socrates');
    expect(roundTrip(base({ grk: 'a', accent: true, caseExact: true }))).toEqual(base({ grk: 'a', accent: true, caseExact: true }));
  });

  it('lists the works left out when that is shorter, and omits all', () => {
    const allBut = ALL.filter(id => id !== 'Meta' && id !== 'EE');
    expect(encodeSearchUrl(base({ grk: 'a', works: allBut }), ALL)).toBe('g=a&w=-Meta,EE');
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

  // Ruling 3 (2026-11-10): a lone grammar term is a search once something
  // narrows it, so the address bar keeps it; a lone word term or a lone NOT
  // term is still no proximity search and is dropped.
  it('keeps a lone grammar term, and drops a lone word or NOT term', () => {
    const lone = (slot: UrlSearch['combo'] extends infer C ? C extends { slots: (infer S)[] } ? S : never : never) => base({
      works: ['Cat'],
      combo: { slots: [slot], window: 5, unit: 'words', ordered: false, crossChapter: true },
    });
    const gram = lone({ kind: 'grammatical', relation: 'near', text: '', picked: [], grammar: { tense: 'aor', mood: 'part', voice: 'pass' } });
    expect(roundTrip(gram)).toEqual(gram);
    expect(encodeSearchUrl(gram, ALL)).toContain('c=g:tense.aor,mood.part,voice.pass');
    const word = lone({ kind: 'form', relation: 'near', text: 'λόγος', picked: [], grammar: {} });
    expect(roundTrip(word).combo).toBeNull();
    const notGram = lone({ kind: 'grammatical', relation: 'not', text: '', picked: [], grammar: { case: 'gen' } });
    expect(roundTrip(notGram).combo).toBeNull();
  });

  // Morpheus's word-class tag (`marker`) left the grammar grid and facets on
  // 2026-11-10. An old link loses it when read. A term that asked nothing
  // else cannot be asked any more, so its whole combo goes rather than run as
  // a different question.
  it.skip('drops the retired word-class tag from an old link', () => {
    const c = (...slots: string[]) => slots.map(x => `c=${encodeURIComponent(x)}`).join('&');
    expect(decodeSearchUrl(`?${c('g:marker.adverb,case.nom', 'f:λόγος')}`, ALL).combo?.slots[0].grammar).toEqual({ case: 'nom' });
    expect(decodeSearchUrl(`?${c('f:λόγος', 'g:marker.adverb')}`, ALL).combo).toBeNull();
    expect(decodeSearchUrl(`?${c('g:marker.adverb', 'f:λόγος', 'fa:ἀρετή')}`, ALL).combo).toBeNull();
    expect(decodeSearchUrl('?g=x&gf=marker.adverb,case.gen', ALL).facets).toEqual({ case: ['gen'] });
  });

  it('round-trips a NOT slot as the relation letter n, ordered or not', () => {
    for (const ordered of [false, true]) {
      const s = base({
        combo: {
          slots: [
            { kind: 'form', relation: 'near', text: 'λόγος', picked: [], grammar: {} },
            { kind: 'lemma', relation: 'not', text: '', picked: ['areth'], grammar: {} },
            { kind: 'grammatical', relation: 'not', text: '', picked: [], grammar: { case: 'gen' } },
          ],
          window: 5, unit: 'line', ordered, crossChapter: true,
        },
      });
      expect(roundTrip(s)).toEqual(s);
      const qs = encodeSearchUrl(s, ALL);
      expect(qs).toContain('c=ln:areth&c=gn:case.gen');
    }
    expect(decodeSearchUrl('?c=f:logos&c=fn:areth', ALL).combo?.slots[1].relation).toBe('not');
  });

  it('reads no proximity search whose first usable slot is NOT', () => {
    expect(decodeSearchUrl('?c=fn:logos&c=f:areth', ALL).combo).toBeNull();
    expect(decodeSearchUrl('?c=f:&c=fn:logos&c=f:areth&c=f:yuxh', ALL).combo).toBeNull();
    expect(decodeSearchUrl('?c=f:logos&c=fn:areth&c=f:yuxh', ALL).combo?.slots).toHaveLength(3);
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
    expect(encodeSearchUrl(base({ grk: 'a', workFilter: 'Meta' }), ALL)).toBe('g=a&wf=Meta');
    expect(roundTrip(base({ eng: 'soul', workFilter: 'EN', works: ['Meta', 'EN'] })))
      .toEqual(base({ eng: 'soul', workFilter: 'EN', works: ['Meta', 'EN'] }));
    // No search: nothing to narrow.
    expect(encodeSearchUrl(base({ workFilter: 'Meta' }), ALL)).toBe('');
    expect(decodeSearchUrl('?g=a', ALL).workFilter).toBeNull();
    expect(decodeSearchUrl('?g=a&wf=Nope', ALL).workFilter).toBeNull();
  });

  it('leaves commas and colons bare and still encodes the rest', () => {
    const qs = encodeSearchUrl(base({ eng: 'virtue, & vice: 1' }), ALL);
    expect(qs).toBe('e=virtue,%20%26%20vice:%201');
    expect(decodeSearchUrl(qs, ALL).eng).toBe('virtue, & vice: 1');
  });
});

describe('search URL: the speaker filter', () => {
  it('writes a filter with its names, and reads it back', () => {
    const s = base({ grk: 'a)reth/', speaker: { mode: 'only', names: ['Socrates', 'EN'] } });
    const qs = encodeSearchUrl(s, ALL);
    expect(qs).toContain('sp=only');
    expect(qs).toContain('sn=Socrates,EN');
    expect(roundTrip(s)).toEqual(s);
    const except = base({ eng: 'justice', speaker: { mode: 'except', names: ['Thrasymachus'] } });
    expect(roundTrip(except)).toEqual(except);
  });

  it('writes nothing for anyone, and reads a filter without names as anyone', () => {
    expect(encodeSearchUrl(base({ grk: 'a', speaker: { mode: 'only', names: [] } }), ALL)).toBe('g=a');
    expect(decodeSearchUrl('?g=a&sp=only', ALL).speaker).toBeNull();
    expect(decodeSearchUrl('?g=a&sp=nobody&sn=Socrates', ALL).speaker).toBeNull();
  });

  it('keeps a speaker filter on a proximity search, and the turn options', () => {
    const s = base({
      speaker: { mode: 'except', names: ['Socrates'] },
      combo: {
        slots: [
          { kind: 'form', relation: 'near', text: 'λόγος', picked: [], grammar: {} },
          { kind: 'lemma', relation: 'after', text: '', picked: ['areth'], grammar: {} },
        ],
        window: 5, unit: 'line', ordered: false, crossChapter: false,
      },
    });
    const qs = encodeSearchUrl(s, ALL);
    expect(qs).toContain('cu=line');
    expect(qs).toContain('cx=0');
    expect(roundTrip(s)).toEqual(s);
  });
});

describe('search URL: forms set aside', () => {
  it('writes xf only when a form is set aside, and reads it back', () => {
    expect(encodeSearchUrl(base({ grk: 'λόγος' }), ALL)).not.toContain('xf=');
    const s = base({ grk: 'λόγος', xforms: ['logon', "d'"] });
    expect(encodeSearchUrl(s, ALL)).toBe(`g=${encodeURIComponent('λόγος')}&xf=logon,d'`);
    expect(roundTrip(s)).toEqual(s);
    expect(decodeSearchUrl('?g=logos', ALL).xforms).toEqual([]);
  });

  it('keeps them on a single-lemma search, and writes none where no Greek word was searched', () => {
    const lemma = base({ lemmas: ['eimi'], xforms: ['hn'] });
    expect(encodeSearchUrl(lemma, ALL)).toBe('l=eimi&xf=hn');
    expect(roundTrip(lemma)).toEqual(lemma);
    expect(encodeSearchUrl(base({ eng: 'virtue', xforms: ['hn'] }), ALL)).toBe('e=virtue');
  });
});

describe('search URL: view and grammar facets', () => {
  it('writes v and gf only when they differ from the default, and reads them back', () => {
    const g = `g=${encodeURIComponent('λόγος')}`;
    expect(encodeSearchUrl(base({ grk: 'λόγος', view: 'page', facets: {} }), ALL)).toBe(g);
    const s = base({ grk: 'λόγος', view: 'grammar', facets: { case: ['gen'], number: ['pl', 'dual'] } });
    expect(encodeSearchUrl(s, ALL)).toBe(`${g}&v=grammar&gf=case.gen,number.pl,number.dual`);
    expect(roundTrip(s)).toEqual(s);
    expect(roundTrip(base({ grk: 'λόγος', view: 'form' }))).toEqual(base({ grk: 'λόγος', view: 'form' }));
    // "By work" is the default now (John, 2026-11-10): an old v=work reads as it.
    expect(decodeSearchUrl(`?${g}&v=work`, ALL).view).toBe('page');
  });

  it('keeps them on a proximity search', () => {
    const combo = decodeSearchUrl('?c=f:logos&c=g:case.gen&v=form&gf=mood.opt', ALL);
    expect(combo.view).toBe('form');
    expect(combo.facets).toEqual({ mood: ['opt'] });
    expect(roundTrip(combo)).toEqual(combo);
  });

  it('writes neither without a search', () => {
    expect(encodeSearchUrl(base({ view: 'grammar', facets: { case: ['gen'] } }), ALL)).toBe('');
  });

  it('falls back to the defaults for an unknown view and malformed facets', () => {
    const s = decodeSearchUrl('?g=logos&v=table&gf=case.gen,number,.pl,mood.,case.gen,voice.mid', ALL);
    expect(s.view).toBe('page');
    expect(s.facets).toEqual({ case: ['gen'], voice: ['mid'] });
    expect(decodeSearchUrl('?g=logos', ALL)).toEqual(base({ grk: 'logos' }));
  });
});

describe('search URL: a facet category that is not one', () => {
  it('ignores a name every object already has, and keeps the rest', () => {
    // "constructor" and "__proto__" are properties of any object: read as
    // categories they crash the page that decodes them.
    const s = decodeSearchUrl('?g=logos&gf=constructor.gen,__proto__.gen,toString.gen,case.gen', ALL);
    expect(s.facets).toEqual({ case: ['gen'] });
    expect(Object.keys(s.facets)).toEqual(['case']);
  });
});

describe('search URL: context, sort and page size', () => {
  const g = `g=${encodeURIComponent('λόγος')}`;
  it('writes nothing for the defaults', () => {
    const s = base({ grk: 'λόγος', context: '3', sort: 'page', pageSize: '40' });
    expect(encodeSearchUrl(s, ALL)).toBe(g);
    expect(decodeSearchUrl(g, ALL)).toEqual(base({ grk: 'λόγος' }));
    expect(base()).toMatchObject({ context: '3', sort: 'page', pageSize: '40' });
  });

  it('round-trips every other value', () => {
    for (const context of ['1', 's'] as const) {
      const s = base({ grk: 'λόγος', context });
      expect(encodeSearchUrl(s, ALL)).toBe(`${g}&ctx=${context}`);
      expect(roundTrip(s)).toEqual(s);
    }
    for (const sort of ['work', 'form', 'freq'] as const) {
      const s = base({ grk: 'λόγος', sort });
      expect(encodeSearchUrl(s, ALL)).toBe(`${g}&so=${sort}`);
      expect(roundTrip(s)).toEqual(s);
    }
    for (const pageSize of ['20', '100', 'c'] as const) {
      const s = base({ grk: 'λόγος', pageSize });
      expect(encodeSearchUrl(s, ALL)).toBe(`${g}&ps=${pageSize}`);
      expect(roundTrip(s)).toEqual(s);
    }
    const all = base({ eng: 'virtue', context: 's', sort: 'freq', pageSize: 'c' });
    expect(roundTrip(all)).toEqual(all);
    const combo = decodeSearchUrl('?c=f:logos&c=f:areth&ctx=1&so=work&ps=20', ALL);
    expect(combo).toMatchObject({ context: '1', sort: 'work', pageSize: '20' });
    expect(roundTrip(combo)).toEqual(combo);
  });

  it('writes none of them without a search', () => {
    expect(encodeSearchUrl(base({ context: 's', sort: 'form', pageSize: 'c' }), ALL)).toBe('');
  });

  it('falls back to the defaults for unknown values', () => {
    const s = decodeSearchUrl(`?${g}&ctx=5&so=title&ps=50`, ALL);
    expect(s).toMatchObject({ context: '3', sort: 'page', pageSize: '40' });
    expect(decodeSearchUrl(`?${g}&ctx=3&so=page&ps=40`, ALL)).toEqual(base({ grk: 'λόγος' }));
  });
});

describe('search URL: running text (PR 9)', () => {
  it('round-trips the third Form choice as m=text, with pu=1 only when punctuation is kept', () => {
    const s = base({ grk: 'ws dokei', matchMode: 'text', accent: true, punctuation: true });
    expect(encodeSearchUrl(s, ALL)).toBe('g=ws%20dokei&m=text&acc=1&pu=1');
    expect(roundTrip(s)).toEqual(s);
    const plain = base({ grk: 'ws dokei', matchMode: 'text' });
    expect(encodeSearchUrl(plain, ALL)).toBe('g=ws%20dokei&m=text');
    expect(roundTrip(plain)).toEqual(plain);
  });

  it('writes pu only in running-text mode, and no word-search match or case there', () => {
    expect(encodeSearchUrl(base({ grk: 'logos', punctuation: true }), ALL)).toBe('g=logos');
    expect(encodeSearchUrl(base({ grk: 'logos', matchMode: 'form', punctuation: true }), ALL)).toBe('g=logos&m=form');
    expect(encodeSearchUrl(base({ grk: 'w(s dokei', matchMode: 'text', grkMode: 'phrase', caseExact: true }), ALL))
      .toBe('g=w(s%20dokei&m=text');
  });

  it('reads an unknown m or pu as the defaults', () => {
    expect(decodeSearchUrl('?g=logos&m=regex&pu=yes', ALL)).toEqual(base({ grk: 'logos' }));
  });
});
