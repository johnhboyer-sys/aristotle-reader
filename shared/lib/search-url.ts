import { AUTHENTIC_IDS, HAS_SPEAKERS } from './works';
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
//   m        form | text (default lemma: any form of the word); text is the
//            running text, the box a regular expression over it (PR 9)
//   pu       1 = running text: match punctuation (default: ignored)
//   acc      1 = match accents exactly
//   cs       read as absent: capitals are always ignored (ruling 5, 12 Nov
//            2026), so an old cs=1 link opens with case ignored; never written
//   xf       Greek forms set aside in the results' form panel: folded keys,
//            comma-separated (default: none)
//   op       or (default and: both queries)
//   w        works: absent = all; "auth" = the authentic works (works.ts
//            authenticity unset or genuine); "EN,Cat" = these; "-Oec,MM" =
//            all but these. Every older spelling still reads as before.
//   t        the translation the English hits are narrowed to
//   wf       the work the hits are narrowed to (the results page's Works row)
//   l        the single-lemma search's picked keys, comma-separated
//   c        one per proximity slot: kind letter, then either "o" (joined
//            to the slot before by "or": one term with it, taking its
//            relation and target) or an optional relation letter (b before,
//            a after, n not near; none = near) and the 1-based number of the
//            earlier term it is measured from (none = term 1); colon,
//            payload — "f:λόγος", "la:logos,areth", "g:case.gen,number.pl",
//            "lo:hdonh" (or the term before), "lb2:luph" (before term 2).
//            A link written before joiners and targets reads as it did:
//            every slot joined by "and", every term measured from term 1
//   cw, cu   proximity window (default 5) and unit (default words)
//   co, cx   co=1: in this order; cx=0: drop hits that cross a chapter
//   sp, sn   the speaker filter: sp=only | except, sn the names, comma-separated
//            (default: anyone, and then sn is not written)
//   v        how the hits are grouped: form | grammar (default page, by work;
//            an old v=work reads as the default)
//   gf       the grammar facets ticked: cat.val, comma-separated, as a
//            proximity slot's g: payload — "case.gen,number.pl" (default: none)
//   ctx      how much text a hit shows: 1 (a line) | s (its whole section)
//            (default 3 lines). Not cx, which is the proximity chapter switch
//   so       the order of a results page: work | form | freq (default page)
//   ps       hits per results page: 20 | 100 | c, citations only (default 40)

import {
  COMBO_TERMS_MAX,
  COMBO_WINDOW_DEFAULT,
  COMBO_WINDOW_MAX,
  type GrammarQuery,
  type LangOp,
  type MatchMode,
  type SearchMode,
  type SlotKind,
  type SpeakerFilter,
  type SlotRelation,
  type WindowUnit,
} from './search';
import {
  PAGE_SIZES, RESULT_CONTEXTS, RESULT_SORTS, RESULT_VIEWS,
  type Facets, type PageSize, type ResultContext, type ResultSort, type ResultView,
} from './result-views';

export interface UrlComboSlot {
  kind: SlotKind;
  relation: SlotRelation;
  or?: true;             // joined to the slot before by "or"
  target?: number;       // the earlier slot it is measured from (0-based); absent = 0
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
  matchMode: MatchMode | 'text';
  accent: boolean;
  punctuation: boolean;     // running text: match the punctuation too
  caseExact: boolean;       // Greek: match capitals and small letters exactly
  langOp: LangOp;
  engForms: boolean;       // English: any form of each word
  works: string[];         // the selected works; every work = all
  trans: string | null;
  workFilter: string | null; // the one work the hits are narrowed to
  lemmas: string[];        // the single-lemma search
  xforms: string[];        // forms set aside in the form panel, as folded keys
  combo: UrlCombo | null;  // a proximity search; it supersedes the rest
  speaker: SpeakerFilter | null; // whose words; null = anyone's
  view: ResultView;        // how the hits are grouped
  facets: Facets;          // the grammar facets ticked
  context: ResultContext;  // how much text a hit shows
  sort: ResultSort;        // the order of a results page
  pageSize: PageSize;      // hits per results page, or citations only
}

export const emptyUrlSearch = (allWorks: string[]): UrlSearch => ({
  grk: '', eng: '', grkMode: 'all', engMode: 'all', matchMode: 'lemma',
  accent: false, punctuation: false, caseExact: false, langOp: 'and', engForms: true, works: [...allWorks], trans: null, workFilter: null,
  lemmas: [], xforms: [], combo: null, speaker: null, view: 'page', facets: {},
  context: '3', sort: 'page', pageSize: '40',
});

const MODES: SearchMode[] = ['all', 'any', 'phrase'];
const UNITS: WindowUnit[] = HAS_SPEAKERS ? ['words', 'line', 'turn', 'chapter'] : ['words', 'line', 'chapter'];
const KIND_LETTER: Record<SlotKind, string> = { phrase: 'p', form: 'f', lemma: 'l', grammatical: 'g' };
const RELATION_LETTER: Record<SlotRelation, string> = { near: '', before: 'b', after: 'a', not: 'n' };
const KINDS = Object.fromEntries(Object.entries(KIND_LETTER).map(([k, v]) => [v, k as SlotKind]));
const RELATIONS = Object.fromEntries(Object.entries(RELATION_LETTER).map(([k, v]) => [v, k as SlotRelation]));

// A Greek letter: not Greek punctuation (U+037E, U+0387), and not Coptic.
const GREEK_LETTER = /(?=\p{L})\p{Script=Greek}/u;

// The named works value: the authentic works, as many as the registry has.
const AUTH = 'auth';
const authenticOf = (allWorks: string[]) => {
  const auth = new Set(AUTHENTIC_IDS);
  return allWorks.filter(id => auth.has(id));
};

const list = (s: string | null) => (s ?? '').split(',').map(x => x.trim()).filter(Boolean);

function encodeSlot(slot: UrlComboSlot): string {
  const payload = slot.kind === 'lemma'
    ? slot.picked.join(',')
    : slot.kind === 'grammatical'
      ? Object.entries(slot.grammar).map(([k, v]) => `${k}.${v}`).join(',')
      : slot.text.trim();
  const head = slot.or ? 'o' : `${RELATION_LETTER[slot.relation]}${slot.target ? slot.target + 1 : ''}`;
  return `${KIND_LETTER[slot.kind]}${head}:${payload}`;
}

// The old pos category is retired. Aristotle's marker (word class) remains
// live in the grammar grid; old pos links lose only that category.
const RETIRED_GRAMMAR = new Set(['pos']);

// null: not a slot. 'retired': a grammar term that asked only a retired
// category, so cannot be asked any more.
// A slot that asks nothing is `empty`: dropped, but its joiner and target are
// read so the slots after it keep theirs (decodeSlots).
function decodeSlot(raw: string): UrlComboSlot | null | 'retired' | { empty: UrlComboSlot } {
  const m = /^([pflg])(?:(o)|([ban]?)([1-9]\d{0,2})?):(.*)$/s.exec(raw);
  if (!m) return null;
  const slot: UrlComboSlot = { kind: KINDS[m[1]], relation: RELATIONS[m[3] ?? ''], text: '', picked: [], grammar: {} };
  if (m[2]) slot.or = true;
  if (m[4]) slot.target = Number(m[4]) - 1;
  const payload = m[5];
  if (slot.kind === 'lemma') slot.picked = list(payload);
  else if (slot.kind === 'grammatical') {
    let retired = false;
    for (const pair of list(payload)) {
      const [k, v] = pair.split('.');
      if (k && v && RETIRED_GRAMMAR.has(k)) retired = true;
      else if (k && v) slot.grammar[k] = v;
    }
    if (retired && !Object.keys(slot.grammar).length) return 'retired';
  } else slot.text = payload.trim();
  const empty = slot.kind === 'lemma' ? !slot.picked.length
    : slot.kind === 'grammatical' ? !Object.keys(slot.grammar).length
    : !slot.text;
  return empty ? { empty: slot } : slot;
}

// The slots that ask something, with each target re-read as an index among
// them: one measured from a dropped slot is measured from what that one was;
// one naming no earlier slot, from the first. A first slot joins nothing; an
// "or" slot after a dropped term takes that term's place, relation and target.
function decodeSlots(raw: ReturnType<typeof decodeSlot>[]): UrlComboSlot[] {
  const out: UrlComboSlot[] = [];
  const at: number[] = [];   // URL slot index -> the kept slot standing for it
  let dropped: { relation: SlotRelation; target: number } | null = null;
  raw.forEach((r, i) => {
    if (r === null || r === 'retired') { at.push(0); return; }
    const slot = 'empty' in r ? r.empty : r;
    const t = slot.target ?? 0;
    const target = t > 0 && t < i ? at[t] : 0;
    const joined = !!slot.or && i > 0;
    if ('empty' in r) {
      if (!joined) dropped = { relation: slot.relation, target };
      at.push(joined ? at[i - 1] : target);
      return;
    }
    const kept: UrlComboSlot = { kind: slot.kind, relation: slot.relation, text: slot.text, picked: slot.picked, grammar: slot.grammar };
    if (joined && dropped) {
      kept.relation = dropped.relation;
      if (dropped.target) kept.target = dropped.target;
    } else if (joined && out.length) kept.or = true;
    else if (target > 0) kept.target = target;
    if (!joined || dropped) dropped = null;
    at.push(out.length);
    out.push(kept);
  });
  return out;
}

// Percent-encoded as a query string, but with commas and colons left bare:
// they separate the parts of a value and read better as themselves.
function serialize(pairs: [string, string][]): string {
  return pairs.map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/g, ',').replace(/%3A/g, ':')}`).join('&');
}

/** The query string (no leading "?") for a search; "" when there is none. */
// A combo the address bar keeps: two terms or more, not opening with NOT; or,
// since ruling 3 (2026-11-10), a lone grammar term, which runs once something
// narrows it.
const comboKept = (slots: UrlComboSlot[]) =>
  slots.length > 0 && slots[0].relation !== 'not' && (slots.length >= 2 || slots[0].kind === 'grammatical');

export function encodeSearchUrl(s: UrlSearch, allWorks: string[]): string {
  const out: [string, string][] = [];
  const put = (k: string, v: string) => out.push([k, v]);
  const combo = s.combo && comboKept(s.combo.slots) ? s.combo : null;
  const grk = s.grk.trim();
  const eng = s.eng.trim();
  if (combo) {
    for (const slot of combo.slots) put('c', encodeSlot(slot));
    if (combo.unit !== 'words') put('cu', combo.unit);
    if (combo.window !== COMBO_WINDOW_DEFAULT) put('cw', String(combo.window));
    if (combo.ordered) put('co', '1');
    if (!combo.crossChapter) put('cx', '0');
  } else {
    if (s.lemmas.length) put('l', s.lemmas.join(','));
    else if (grk) {
      put('g', grk);
      // The running text is one pattern: no word match mode belongs to it.
      const text = s.matchMode === 'text';
      if (s.grkMode !== 'all' && !text) put('gm', s.grkMode);
      if (s.matchMode !== 'lemma' && s.matchMode !== 'headword') put('m', s.matchMode);
      if (s.accent) put('acc', '1');
      if (text && s.punctuation) put('pu', '1');
    }
    if ((s.lemmas.length || grk) && s.xforms.length) put('xf', s.xforms.join(','));
    if (eng) {
      put('e', eng);
      if (s.engMode !== 'all') put('em', s.engMode);
      if (!s.engForms) put('ef', '0');
      if ((s.lemmas.length || grk) && s.langOp === 'or') put('op', 'or');
      if (s.trans) put('t', s.trans);
    }
  }
  if (combo && s.trans) put('t', s.trans);
  if (combo && s.xforms.length) put('xf', s.xforms.join(','));
  if (!out.length) return '';
  if (s.speaker?.names.length) {
    put('sp', s.speaker.mode);
    put('sn', s.speaker.names.join(','));
  }
  if (s.view !== 'page') put('v', s.view);
  const gf = Object.entries(s.facets).flatMap(([k, values]) => values.map(v => `${k}.${v}`));
  if (gf.length) put('gf', gf.join(','));
  if (s.context !== '3') put('ctx', s.context);
  if (s.sort !== 'page') put('so', s.sort);
  if (s.pageSize !== '40') put('ps', s.pageSize);
  if (s.workFilter) put('wf', s.workFilter);
  const chosen = new Set(s.works);
  const auth = authenticOf(allWorks);
  const isAuth = auth.length > 0 && auth.length === chosen.size && auth.every(id => chosen.has(id));
  if (allWorks.some(id => !chosen.has(id))) {
    const inList = allWorks.filter(id => chosen.has(id));
    const outList = allWorks.filter(id => !chosen.has(id));
    put('w', isAuth ? AUTH : inList.length && outList.join(',').length < inList.join(',').length
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
  const m = p.get('m');
  s.matchMode = m === 'form' || m === 'text' ? m : 'lemma';
  s.accent = p.get('acc') === '1';
  s.punctuation = p.get('pu') === '1';
  s.caseExact = false;   // cs is ignored: case never matters
  s.langOp = p.get('op') === 'or' ? 'or' : 'and';
  s.engForms = p.get('ef') !== '0';
  s.trans = p.get('t') || null;
  const wf = p.get('wf');
  s.workFilter = wf && allWorks.includes(wf) ? wf : null;
  s.lemmas = list(p.get('l'));
  s.xforms = list(p.get('xf'));

  const decoded = p.getAll('c').map(decodeSlot);
  const slots = decodeSlots(decoded).slice(0, COMBO_TERMS_MAX);
  // A first slot of NOT has nothing to stand apart from: no proximity search.
  // A combo with a term that can no longer be asked is not run as another.
  if (!decoded.includes('retired') && comboKept(slots)) {
    // Clamped as the window box clamps what is typed into it.
    const win = Number(p.get('cw'));
    s.combo = {
      slots,
      window: win > 0 ? Math.max(1, Math.min(win, COMBO_WINDOW_MAX)) : COMBO_WINDOW_DEFAULT,
      unit: pick(p.get('cu'), UNITS, 'words'),
      ordered: p.get('co') === '1',
      crossChapter: p.get('cx') !== '0',
    };
  }

  const sp = p.get('sp');
  const names = list(p.get('sn'));
  if ((sp === 'only' || sp === 'except') && names.length) s.speaker = { mode: sp, names };

  s.view = pick(p.get('v'), RESULT_VIEWS, 'page');
  s.context = pick(p.get('ctx'), RESULT_CONTEXTS, '3');
  s.sort = pick(p.get('so'), RESULT_SORTS, 'page');
  s.pageSize = pick(p.get('ps'), PAGE_SIZES, '40');
  for (const pair of list(p.get('gf'))) {
    const [k, v, extra] = pair.split('.');
    // A name every object has ("constructor", "__proto__") is not a category,
    // and read as one would hand back a function where a list belongs.
    if (!k || !v || extra !== undefined || k in Object.prototype || RETIRED_GRAMMAR.has(k)) continue;
    const values = (s.facets[k] ??= []);
    if (!values.includes(v)) values.push(v);
  }

  const w = p.get('w');
  if (w === AUTH) s.works = authenticOf(allWorks);
  else if (w !== null) {
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
