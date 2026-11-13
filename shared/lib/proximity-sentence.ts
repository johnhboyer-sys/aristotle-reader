// A proximity search said in one sentence (ruling 11), the same grammar
// everywhere: "ἕξις near ἀρετή, ἡδονή before ἀρετή, within 10 words". "Any
// form of" is the default kind and goes unsaid; the other kinds are named
// ("any genitive plural near ἀρετή"); an or-joined term reads "either ἕξις
// or ἡδονή"; ", in authentic works" (or the In value) closes it when the
// search is not over all works.
import { comboGroups, type GrammarQuery, type SlotKind, type SlotRelation, type WindowUnit } from './search';

export interface SentenceTerm {
  kind: SlotKind;
  text: string;
  picked: string[];
  grammar: GrammarQuery;
  relation: SlotRelation;
  or?: boolean;
  target?: number;
}

// Each grammar value as a word, in the order English puts them before a
// noun: "first person aorist passive", "genitive plural".
const GRAMMAR_ORDER = ['person', 'degree', 'tense', 'mood', 'voice', 'gender', 'case', 'number', 'marker'];
const GRAMMAR_WORDS: Record<string, string> = {
  nom: 'nominative', gen: 'genitive', dat: 'dative', acc: 'accusative', voc: 'vocative',
  sg: 'singular', pl: 'plural', dual: 'dual',
  masc: 'masculine', fem: 'feminine', neut: 'neuter',
  pres: 'present', imperf: 'imperfect', fut: 'future', aor: 'aorist', perf: 'perfect', plup: 'pluperfect', futperf: 'future perfect',
  ind: 'indicative', subj: 'subjunctive', opt: 'optative', imperat: 'imperative', inf: 'infinitive', part: 'participle',
  act: 'active', mid: 'middle', pass: 'passive', mp: 'middle or passive',
  '1st': 'first person', '2nd': 'second person', '3rd': 'third person',
  comp: 'comparative', superl: 'superlative', irreg_comp: 'irregular comparative',
  prep: 'preposition', conj: 'conjunction', interrog: 'interrogative', exclam: 'exclamation', indecl: 'indeclinable',
};

/** A grammatical description as words: { case: 'gen', number: 'pl' } → "genitive plural". */
export function grammarWords(query: GrammarQuery): string {
  return Object.entries(query)
    .sort(([a], [b]) => GRAMMAR_ORDER.indexOf(a) - GRAMMAR_ORDER.indexOf(b))
    .map(([, v]) => GRAMMAR_WORDS[v] ?? v)
    .join(' ');
}

const usable = (t: SentenceTerm) =>
  t.kind === 'grammatical' ? Object.keys(t.grammar).length > 0 : t.kind === 'lemma' ? t.picked.length > 0 : !!t.text.trim();

/** One term as the sentence names it; `heads` turns a picked key into its headword. */
export function termWords(t: SentenceTerm, heads: (key: string) => string): string {
  if (t.kind === 'lemma') return t.picked.map(heads).join(' or ');
  if (t.kind === 'grammatical') return `any ${grammarWords(t.grammar)}`;
  if (t.kind === 'phrase') return `the phrase ${t.text.trim()}`;
  return `${t.text.trim()} as typed`;
}

const RELATION_WORDS: Record<SlotRelation, string> = { near: 'near', before: 'before', after: 'after', not: 'not near' };

/** The whole search in one sentence; `works` is the In value, or null for all works. */
export function proximitySentence(
  terms: SentenceTerm[],
  opts: { window: number; unit: WindowUnit; ordered: boolean },
  heads: (key: string) => string,
  works: string | null,
): string {
  const groups = comboGroups(terms, usable);
  const named = groups.map(g => {
    const words = g.members.map(t => termWords(t, heads));
    if (words.length === 1) return words[0];
    return `either ${words.slice(0, -1).join(', ')}${words.length > 2 ? ',' : ''} or ${words[words.length - 1]}`;
  });
  const parts = groups.length > 1
    ? groups.slice(1).map((g, i) => `${named[i + 1]} ${RELATION_WORDS[g.relation]} ${named[g.target]}`)
    : named.slice(0, 1);
  if (groups.length > 1) {
    parts.push(opts.unit === 'words' ? `within ${opts.window} word${opts.window === 1 ? '' : 's'}`
      : opts.unit === 'line' ? 'in the same line'
      : opts.unit === 'chapter' ? 'in the same chapter'
      : 'in the same speech');
    const placed = groups.slice(1).some(g => g.relation === 'before' || g.relation === 'after');
    if (opts.ordered && !placed) parts.push('in this order');
  }
  if (works) parts.push(`in ${works}`);
  return parts.join(', ');
}
