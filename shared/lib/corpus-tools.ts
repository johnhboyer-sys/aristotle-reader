// Corpus tools over the stage 8 phrase index: "Where else" from a selection in
// the reader, and the phrases two works share. Both read only what the Phrases
// page reads (the browse shards and their occurrence files) and cite through
// citation.ts, so no line number ever reaches the page.

import {
  decodeOffsets,
  fetchNgramOccurrences,
  fetchNgramShard,
} from './data';
import { formatCite, formatLocValue } from './citation';
import {
  VARIANT_READING_CAP,
  lemmaOptions,
  lemmaReadings,
  offsetRef,
  type Offsets,
} from './search';
import { workPath } from './works';

export type GreekStream = 'form' | 'lemma';

// Stage 8 indexes runs of two to five words; nothing else can be asked of it.
export const WHERE_ELSE_MIN = 2;
export const WHERE_ELSE_MAX = 5;
export const whereElseOffered = (words: number) =>
  words >= WHERE_ELSE_MIN && words <= WHERE_ELSE_MAX;

/** A token key as stage 6 folds it into the form stream (fold_lemma). */
export const foldKey = (k: string) => k.toLowerCase().replace(/[^a-z']/g, '');

/** The shard a phrase lives in: its first letter, the rule stage 8 used. */
export function shardLetter(phrase: string): string {
  const first = phrase[0] ?? '';
  return first >= 'a' && first <= 'z' ? first : '_';
}

/** The folded keys of the Greek words a range covers, in reading order.
 *  null when any covered word has no key: such a run cannot be in the index. */
export function selectedKeys(range: Range, root: ParentNode): string[] | null {
  return selectedTokenKeys(range, root)?.map(foldKey) ?? null;
}

/** The Beta Code keys, unfolded, of the Greek words a range covers. */
export function selectedTokenKeys(range: Range, root: ParentNode): string[] | null {
  const keys: string[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('.tok[data-k]')) {
    if (!range.intersectsNode(el)) continue;
    const k = el.dataset.k ?? '';
    if (!foldKey(k)) return null;
    keys.push(k);
  }
  return keys;
}

/** One dictionary-word reading of a selection and where it stands. */
export interface ReadingHits {
  key: string;                        // the reading's index key
  count: number;                      // its occurrences, all works together
  byWork: Record<string, number[]>;   // work -> sorted global offsets
}

export interface Occurrences {
  readings: string[];                 // the index keys that matched, as grouped
  byWork: Record<string, number[]>;   // work -> sorted global offsets, all readings
  groups: ReadingHits[];              // one per matching reading, see below
  searched: number;                   // readings looked up
  total: number;                      // readings there are; more than searched when cut
}

/** Every occurrence of a run of folded forms, by form or by dictionary word.
 *
 * By lemma, each word is read as every headword the lemma map gives it and
 * each reading looked up, as the Phrases page widens a typed phrase; the index
 * holds every reading at every position. `primary` gives each word's headword
 * in its primary analysis, where known: those headwords are tried first, so
 * the selection's own reading survives the cap, and its group leads. The
 * other groups follow, commonest first. */
export async function findOccurrences(
  stream: GreekStream,
  forms: string[],
  primary: Array<string | null> = [],
): Promise<Occurrences> {
  let keys = [forms.join(' ')];
  let total = 1;
  let own: string | null = null;
  if (stream === 'lemma') {
    const options = await lemmaOptions(forms);
    const perTerm = forms.map((f, i) => {
      const heads = options?.[i]?.length ? options[i] : [f];
      const p = primary[i];
      return p && heads.includes(p) ? [p, ...heads.filter((h) => h !== p)] : heads;
    });
    const cut = lemmaReadings(perTerm, VARIANT_READING_CAP);
    keys = cut.readings.map((r) => r.join(' '));
    total = cut.total;
    if (forms.every((_, i) => primary[i] && perTerm[i][0] === primary[i])) own = keys[0];
  }
  const n = forms.length;
  const groups: ReadingHits[] = [];
  const merged: Record<string, Set<number>> = {};
  for (const key of keys) {
    const letter = shardLetter(key);
    const shard = await fetchNgramShard(stream, letter);
    if (!Object.hasOwn(shard, key)) continue;
    const occ = await fetchNgramOccurrences(stream, letter, n);
    const found = Object.hasOwn(occ, key) ? occ[key] : {};
    const byWork: Record<string, number[]> = {};
    let count = 0;
    for (const [work, deltas] of Object.entries(found)) {
      const offsets = decodeOffsets(deltas);
      byWork[work] = offsets;
      count += offsets.length;
      const set = (merged[work] ??= new Set());
      for (const at of offsets) set.add(at);
    }
    groups.push({ key, count, byWork });
  }
  groups.sort((x, y) => Number(y.key === own) - Number(x.key === own) || y.count - x.count);
  const byWork: Record<string, number[]> = {};
  for (const [work, set] of Object.entries(merged)) byWork[work] = [...set].sort((a, b) => a - b);
  return { readings: groups.map((g) => g.key), byWork, groups, searched: keys.length, total };
}

export interface Citation {
  cite: string;
  href: string;
}

/** Global offsets in one work as Stephanus citations linking into the reader. */
export function citationsFor(work: string, offsets: Offsets, globals: number[], base: string): Citation[] {
  const out: Citation[] = [];
  for (const g of globals) {
    const ref = offsetRef(offsets, g);
    if (!ref) continue;
    out.push({
      cite: formatCite(work, ref.column, ref.line, ref.sub),
      href: `${base}${workPath(work, ref.book)}?loc=${formatLocValue(work, ref.column, ref.line)}`,
    });
  }
  return out;
}

export interface SharedPhrase {
  key: string;
  n: number;
  a: number[];   // global offsets in the first work
  b: number[];   // and in the second
}

/** The phrases two works both use, from loaded occurrence files. */
export function sharedPhrases(
  files: Array<Record<string, Record<string, number[]>>>,
  workA: string,
  workB: string,
): SharedPhrase[] {
  const out: SharedPhrase[] = [];
  if (!workA || !workB || workA === workB) return out;
  for (const file of files) {
    for (const [key, byWork] of Object.entries(file)) {
      const a = byWork[workA];
      const b = byWork[workB];
      if (!a || !b) continue;
      out.push({ key, n: key.split(' ').length, a: decodeOffsets(a), b: decodeOffsets(b) });
    }
  }
  return out;
}

// The grammatical words, as dictionary words: the folded headword keys the
// lemma map gives (o = ὁ, eimi = εἰμί, ec = ἐξ). For the site owner's review;
// one entry per headword, grouped by kind. A written form is grammatical only
// when EVERY headword the lemma map gives it is on this list, so a spelling a
// content word shares stays content: εν is ἐν and ἕν, δια is διά and Ζεύς,
// αλλα is ἀλλά and ἄλλα. A form the map gives no headword is content too.
// No adverbs that can carry weight (νῦν, ἔτι, ἤδη, πάνυ, ποτέ, πῶς, ποῦ,
// οὕτως), no ἠμί "say" (ἦ δ' ἐγώ) and no ταὐτός (ταὐτὸν καί): those phrases
// are Plato's own. αὐτοῦ, τῷ, τῇ stay: as headwords they are the deictic
// adverbs and the particle, but nearly every written αὐτοῦ, τῷ, τῇ is the
// pronoun or the article, which the map also gives them.
export const GREEK_FUNCTION_LEMMATA = new Set(`
  o
  kai de te men oun gar alla ou mh ei ws an ean kan ge dh toinun mhn
  oude oute mhte mhde ara per oti epei ina eite kaitoi mentoi oukoun toi
  h wsper hde tw th ai hn w
  autou
  eimi
  en eis ek ec peri pros kata para dia epi apo upo meta uper ana anti pro sun amfi
  autos outos ode ekeinos egw su e sfeis eautou emautou emos sos
  tis os ostis osper
`.trim().split(/\s+/));

/** The written forms among `words` that are grammatical words: those whose
 *  every headword in the lemma map is on GREEK_FUNCTION_LEMMATA. Empty when
 *  the lemma map cannot be loaded, so every word then counts as content. */
export async function grammaticalForms(words: Iterable<string>): Promise<Set<string>> {
  const unique = [...new Set(words)];
  const options = await lemmaOptions(unique);
  const out = new Set<string>();
  unique.forEach((w, i) => {
    const heads = options?.[i] ?? [];
    if (heads.length && heads.every((h) => GREEK_FUNCTION_LEMMATA.has(h))) out.add(w);
  });
  return out;
}

/** How many of a phrase's words are not grammatical words. `grammatical` is
 *  grammaticalForms' answer for the form stream, GREEK_FUNCTION_LEMMATA for
 *  the lemma stream, whose keys are headwords already. */
export function contentWords(phrase: string, grammatical: ReadonlySet<string>): number {
  let n = 0;
  for (const w of phrase.split(' ')) if (!grammatical.has(w)) n++;
  return n;
}
