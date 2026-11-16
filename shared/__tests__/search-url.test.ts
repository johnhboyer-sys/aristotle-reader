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
    const s = decodeSearchUrl('?g=a&gm=nonsense&em=&m=headword&op=nand&w=EN,Nope&cw=3', ALL);
    expect(s).toEqual(base({ grk: 'a', works: ['EN'] }));
  });

  it('round-trips a single-lemma search with its English side', () => {
    const s = base({ lemmas: ['logos', 'areth'], eng: 'reason', langOp: 'or' });
    expect(roundTrip(s)).toEqual(s);
    expect(encodeSearchUrl(s, ALL)).toBe('l=logos,areth&e=reason&op=or');
  });

  it('opens on and/or, and reads an old Greek and English link with no op as "and"', () => {
    expect(emptyUrlSearch(ALL).langOp).toBe('or');
    expect(decodeSearchUrl('', ALL).langOp).toBe('or');
    expect(decodeSearchUrl('?e=virtue', ALL).langOp).toBe('or');
    expect(decodeSearchUrl('?g=a&e=virtue', ALL).langOp).toBe('and');
    expect(decodeSearchUrl('?l=areth&e=virtue', ALL).langOp).toBe('and');
  });

  it('names the op in every Greek and English link it writes', () => {
    for (const op of ['and', 'or', 'xor'] as const) {
      const s = base({ grk: 'a', eng: 'virtue', langOp: op });
      expect(encodeSearchUrl(s, ALL)).toContain(`op=${op}`);
      expect(roundTrip(s)).toEqual(s);
    }
  });

  it('round-trips the exclusive or, and keeps op=or the inclusive one', () => {
    const s = base({ grk: 'ἀρετή', eng: 'virtue', langOp: 'xor' });
    expect(roundTrip(s)).toEqual(s);
    expect(encodeSearchUrl(s, ALL)).toContain('op=xor');
    expect(decodeSearchUrl('?g=a&e=b&op=or', ALL).langOp).toBe('or');
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

describe('Aristotle URL forms alongside the adopted grammar', () => {
  it('keeps the chapter unit and chapter-crossing switch on old proximity links', () => {
    const state = decodeSearchUrl('?c=f:ἀρετή&c=f:ἕξις&cu=chapter&cx=0&cw=10', ALL);
    expect(state.combo).toEqual({
      slots: [
        { kind: 'form', relation: 'near', text: 'ἀρετή', picked: [], grammar: {} },
        { kind: 'form', relation: 'near', text: 'ἕξις', picked: [], grammar: {} },
      ], window: 10, unit: 'chapter', ordered: false, crossChapter: false,
    });
    expect(roundTrip(state)).toEqual(state);
  });
  it('keeps Morpheus word-class tags, which Aristotle still indexes', () => {
    const state = decodeSearchUrl('?c=g:marker.adverb&c=f:λόγος', ALL);
    expect(state.combo?.slots[0].grammar).toEqual({ marker: 'adverb' });
    expect(roundTrip(state)).toEqual(state);
  });
});

// S3: each proximity slot carries its joiner and the term it is measured
// from, inside the c= grammar: "o" after the kind letter for a term joined
// by "or" (it takes the term's relation and target, so writes neither), else
// the relation letter, then the 1-based number of the term it is measured
// from when that is not term 1.
describe('proximity joiners and targets', () => {
  const slot = (kind: 'lemma' | 'form', word: string, over: object = {}) => ({
    kind, relation: 'near' as const, text: kind === 'form' ? word : '', picked: kind === 'lemma' ? [word] : [], grammar: {}, ...over,
  });
  const combo = (slots: ReturnType<typeof slot>[], over: object = {}) =>
    base({ combo: { slots, window: 10, unit: 'words', ordered: false, crossChapter: true, ...over } });

  it('writes an or-joined term as "o", and a target as the term number', () => {
    const s = combo([
      slot('lemma', 'areth'),
      slot('lemma', 'ecis'),
      slot('lemma', 'hdonh', { or: true }),
      slot('lemma', 'luph', { relation: 'before', target: 1 }),
    ]);
    expect(encodeSearchUrl(s, ALL)).toContain('c=l:areth&c=l:ecis&c=lo:hdonh&c=lb2:luph&cw=10');
    expect(roundTrip(s)).toEqual(s);
    const not = combo([slot('lemma', 'areth'), slot('lemma', 'ecis'), slot('form', 'λόγος', { relation: 'not', target: 1 })]);
    expect(encodeSearchUrl(not, ALL)).toContain(`c=fn2:${encodeURIComponent('λόγος')}`);
    expect(roundTrip(not)).toEqual(not);
  });

  it('reads an "or" slot after a dropped term as that term, with its relation and target', () => {
    const slots = decodeSearchUrl('?c=l:a&c=l:b&c=la2:&c=lo:d', ALL).combo!.slots;
    expect(slots).toEqual([
      { kind: 'lemma', relation: 'near', text: '', picked: ['a'], grammar: {} },
      { kind: 'lemma', relation: 'near', text: '', picked: ['b'], grammar: {} },
      { kind: 'lemma', relation: 'after', target: 1, text: '', picked: ['d'], grammar: {} },
    ]);
  });

  it('opens every older link as it opened before: no joiner, every term from term 1', () => {
    for (const qs of ['?c=l:areth&c=l:ecis', '?c=l:areth&c=lb:hdonh&c=ln:luph&cw=10', '?c=f:a&c=fa:b&c=gb:case.gen&co=1']) {
      const read = decodeSearchUrl(qs, ALL).combo!;
      for (const s of read.slots) {
        expect(s.or).toBeUndefined();
        expect(s.target).toBeUndefined();
      }
    }
  });

  it('reads a target that is not an earlier term as term 1', () => {
    const read = (qs: string) => decodeSearchUrl(qs, ALL).combo?.slots.map((s) => s.target ?? 0);
    expect(read('?c=l:a&c=l2:b&c=l9:c')).toEqual([0, 0, 0]);
    expect(read('?c=l:a&c=l:b&c=l2:c')).toEqual([0, 0, 1]);
    // A first term joined by "or" has nothing to join.
    expect(decodeSearchUrl('?c=lo:a&c=l:b', ALL).combo?.slots[0].or).toBeUndefined();
  });

  it('keeps targets pointing at the same terms when an empty slot is dropped', () => {
    // The empty second slot goes; term 4 was measured from term 3, which is now term 2.
    const slots = decodeSearchUrl('?c=l:a&c=l:&c=l:c&c=l3:d', ALL).combo!.slots;
    expect(slots.map((s) => [s.picked[0], s.target ?? 0])).toEqual([['a', 0], ['c', 0], ['d', 1]]);
    // A term measured from the dropped slot is measured from term 1.
    const from = decodeSearchUrl('?c=l:a&c=l:b&c=l:&c=l3:d', ALL).combo!.slots;
    expect(from.map((s) => [s.picked[0], s.target ?? 0])).toEqual([['a', 0], ['b', 0], ['d', 0]]);
  });

  it('measures a term from the or-member that takes an empty head\'s place (Codex review)', () => {
    // The empty term 2 goes; b, joined to it by "or", stands in its place,
    // so d, measured from term 2, is measured from b.
    const slots = decodeSearchUrl('?c=l:a&c=la:&c=lo:b&c=l2:c', ALL).combo!.slots;
    expect(slots.map((s) => [s.picked[0], s.relation, s.target ?? 0])).toEqual([['a', 'near', 0], ['b', 'after', 0], ['c', 'near', 1]]);
    // An empty member between them points the same way.
    const two = decodeSearchUrl('?c=l:a&c=la:&c=lo:&c=lo:b&c=l3:c', ALL).combo!.slots;
    expect(two.map((s) => [s.picked[0], s.target ?? 0])).toEqual([['a', 0], ['b', 0], ['c', 1]]);
    // A group with nothing left: measured from what the head was measured from.
    const none = decodeSearchUrl('?c=l:a&c=l:b&c=l2:&c=lo:&c=l3:c', ALL).combo!.slots;
    expect(none.map((s) => [s.picked[0], s.target ?? 0])).toEqual([['a', 0], ['b', 0], ['c', 1]]);
  });
});
