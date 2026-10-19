// The search page's state as a query string, so a search can be shared,
// bookmarked, reloaded and stepped through with the back button.
//
// Only what the search actually ran on is written, and defaults are left
// out: a plain Greek search is ?g=λόγος, nothing more. ?g= and ?e= are also
// what the command palette hands off, so they keep their meaning here.
//
//   g, e     Greek and English queries
//   q        read only, never written: the search box of search.astro's
//            JSON-LD SearchAction. Greek script goes to g, anything else
//            to e (Beta Code reads the same as English, so it goes to e);
//            ignored when g or e is present, even empty
//   gm, em   Greek and English match: any | phrase (default all)
//   ef       0 = English words only as typed (default: any form of each)
//   m        form (default lemma: any form of the word)
//   acc      1 = match accents exactly
//   op       or (default and: both queries)
//   w        works: absent = all; "EN,Pol" = these; "-Cat,Int" = all but these
//   t        the translation the English hits are narrowed to
//   wf       the work the hits are narrowed to (the results page's Works row)
//   l        the single-lemma search's picked keys, comma-separated
//   c        one per proximity slot: kind letter, optional relation letter,
//            colon, payload — "f:λόγος", "la:logos,areth", "g:case.gen,number.pl"
//   cw, cu   proximity window (default 5) and unit (default words)
//   co, cx   co=1: in this order; cx=0: drop hits that cross a chapter

import {
  COMBO_WINDOW_DEFAULT,
  COMBO_WINDOW_MAX,
  type GrammarQuery,
  type LangOp,
  type MatchMode,
  type SearchMode,
  type SlotKind,
  type SlotRelation,
  type WindowUnit,
} from './search';

export interface UrlComboSlot {
  kind: SlotKind;
  relation: SlotRelation;
  text: string;          // phrase / form
  picked: string[];      // lemma
  grammar: GrammarQuery; // grammatical
}

export interface UrlCombo {
  slots: UrlComboSlot[];
  window: number;
  unit: WindowUnit;
  ordered: boolean;
  crossChapter: boolean;
}

export interface UrlSearch {
  grk: string;
  eng: string;
  grkMode: SearchMode;
  engMode: SearchMode;
  matchMode: MatchMode;
  accent: boolean;
  langOp: LangOp;
  engForms: boolean;       // English: any form of each word
  works: string[];         // the selected works; every work = all
  trans: string | null;
  workFilter: string | null; // the one work the hits are narrowed to
  lemmas: string[];        // the single-lemma search
  combo: UrlCombo | null;  // a proximity search; it supersedes the rest
}

export const emptyUrlSearch = (allWorks: string[]): UrlSearch => ({
  grk: '', eng: '', grkMode: 'all', engMode: 'all', matchMode: 'lemma',
  accent: false, langOp: 'and', engForms: true, works: [...allWorks], trans: null, workFilter: null,
  lemmas: [], combo: null,
});

const MODES: SearchMode[] = ['all', 'any', 'phrase'];
const UNITS: WindowUnit[] = ['words', 'line', 'chapter'];
const KIND_LETTER: Record<SlotKind, string> = { phrase: 'p', form: 'f', lemma: 'l', grammatical: 'g' };
const RELATION_LETTER: Record<SlotRelation, string> = { near: '', before: 'b', after: 'a' };
const KINDS = Object.fromEntries(Object.entries(KIND_LETTER).map(([k, v]) => [v, k as SlotKind]));
const RELATIONS = Object.fromEntries(Object.entries(RELATION_LETTER).map(([k, v]) => [v, k as SlotRelation]));

// A Greek letter: not Greek punctuation (U+037E, U+0387), and not Coptic.
const GREEK_LETTER = /(?=\p{L})\p{Script=Greek}/u;

const list = (s: string | null) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean);

function encodeSlot(slot: UrlComboSlot): string {
  const payload = slot.kind === 'lemma'
    ? slot.picked.join(',')
    : slot.kind === 'grammatical'
      ? Object.entries(slot.grammar).map(([k, v]) => `${k}.${v}`).join(',')
      : slot.text.trim();
  return `${KIND_LETTER[slot.kind]}${RELATION_LETTER[slot.relation]}:${payload}`;
}

function decodeSlot(raw: string): UrlComboSlot | null {
  const m = /^([pflg])([ba]?):(.*)$/s.exec(raw);
  if (!m) return null;
  const slot: UrlComboSlot = { kind: KINDS[m[1]], relation: RELATIONS[m[2]], text: '', picked: [], grammar: {} };
  if (slot.kind === 'lemma') slot.picked = list(m[3]);
  else if (slot.kind === 'grammatical') {
    for (const pair of list(m[3])) {
      const [k, v] = pair.split('.');
      if (k && v) slot.grammar[k] = v;
    }
  } else slot.text = m[3].trim();
  const empty = slot.kind === 'lemma' ? !slot.picked.length
    : slot.kind === 'grammatical' ? !Object.keys(slot.grammar).length
    : !slot.text;
  return empty ? null : slot;
}

// Percent-encoded as a query string, but with commas and colons left bare:
// they separate the parts of a value and read better as themselves.
function serialize(pairs: [string, string][]): string {
  return pairs.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':')}`).join('&');
}

/** The query string (no leading "?") for a search; "" when there is none. */
export function encodeSearchUrl(s: UrlSearch, allWorks: string[]): string {
  const out: [string, string][] = [];
  const put = (k: string, v: string) => out.push([k, v]);
  const combo = s.combo && s.combo.slots.length >= 2 ? s.combo : null;
  const grk = s.grk.trim();
  const eng = s.eng.trim();
  if (combo) {
    for (const slot of combo.slots) put('c', encodeSlot(slot));
    if (combo.unit !== 'words') put('cu', combo.unit);
    else if (combo.window !== COMBO_WINDOW_DEFAULT) put('cw', String(combo.window));
    if (combo.ordered) put('co', '1');
    if (!combo.crossChapter) put('cx', '0');
  } else {
    if (s.lemmas.length) put('l', s.lemmas.join(','));
    else if (grk) {
      put('g', grk);
      if (s.grkMode !== 'all') put('gm', s.grkMode);
      if (s.matchMode === 'form') put('m', 'form');
      if (s.accent) put('acc', '1');
    }
    if (eng) {
      put('e', eng);
      if (s.engMode !== 'all') put('em', s.engMode);
      if (!s.engForms) put('ef', '0');
      if ((s.lemmas.length || grk) && s.langOp === 'or') put('op', 'or');
      if (s.trans) put('t', s.trans);
    }
  }
  if (!out.length) return '';
  if (s.workFilter) put('wf', s.workFilter);
  const chosen = new Set(s.works);
  if (allWorks.some(id => !chosen.has(id))) {
    const inList = allWorks.filter(id => chosen.has(id));
    const outList = allWorks.filter(id => !chosen.has(id));
    put('w', inList.length && outList.join(',').length < inList.join(',').length
      ? `-${outList.join(',')}`
      : inList.join(','));
  }
  return serialize(out);
}

/** Reads a search back from a query string. Unknown values fall back to defaults. */
export function decodeSearchUrl(search: string | URLSearchParams, allWorks: string[]): UrlSearch {
  const p = typeof search === 'string' ? new URLSearchParams(search) : search;
  const s = emptyUrlSearch(allWorks);
  const pick = <T extends string>(v: string | null, allowed: readonly T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;

  s.grk = (p.get('g') ?? '').trim();
  s.eng = (p.get('e') ?? '').trim();
  const q = (p.get('q') ?? '').trim();
  if (q && !p.has('g') && !p.has('e')) {
    if (GREEK_LETTER.test(q)) s.grk = q;
    else s.eng = q;
  }
  s.grkMode = pick(p.get('gm'), MODES, 'all');
  s.engMode = pick(p.get('em'), MODES, 'all');
  s.matchMode = p.get('m') === 'form' ? 'form' : 'lemma';
  s.accent = p.get('acc') === '1';
  s.langOp = p.get('op') === 'or' ? 'or' : 'and';
  s.engForms = p.get('ef') !== '0';
  s.trans = p.get('t') || null;
  const wf = p.get('wf');
  s.workFilter = wf && allWorks.includes(wf) ? wf : null;
  s.lemmas = list(p.get('l'));

  const slots = p.getAll('c').map(decodeSlot).filter((x): x is UrlComboSlot => x !== null);
  if (slots.length >= 2) {
    // Clamped as the window box clamps what is typed into it.
    const win = Number(p.get('cw'));
    s.combo = {
      slots: slots.slice(0, 4),
      window: win > 0 ? Math.max(1, Math.min(win, COMBO_WINDOW_MAX)) : COMBO_WINDOW_DEFAULT,
      unit: pick(p.get('cu'), UNITS, 'words'),
      ordered: p.get('co') === '1',
      crossChapter: p.get('cx') !== '0',
    };
  }

  const w = p.get('w');
  if (w !== null) {
    const known = new Set(allWorks);
    const named = new Set(list(w.replace(/^-/, '')).filter(id => known.has(id)));
    s.works = w.startsWith('-')
      ? allWorks.filter(id => !named.has(id))
      : allWorks.filter(id => named.has(id));
  }
  return s;
}

/** Whether the decoded state asks for a search at all. */
export const hasSearch = (s: UrlSearch) => !!(s.grk || s.eng || s.lemmas.length || s.combo);
