// A typed word's accents, used to choose among the headwords its folded
// spelling is shared by.
//
// A lemma search folds the typed word (accents, breathings, and case dropped)
// and takes the bare fold and every key the lemma map files under it. αὐτή
// (αὐτός), αὕτη (οὗτος), and αὑτῇ (ἑαυτοῦ) all fold to "auth", so a search for
// αὐτή took in every form of οὗτος. The search index itself knows which keys
// it gave the printed words spelled αὐτή: this table, made at site build by
// reading the word at every lemma posting, carries that to the search page.
//
// Ownership comes from the index, not the analyses, because the two can
// disagree (a token's key is resolved at index time), and a narrowing must
// never drop a hit the wide search had for a word spelled as typed.

import { betaQueryToGreek } from './betacode';

/** Folded spelling → accent key of a printed spelling → the keys to search. */
export type LemmaAccents = Record<string, Record<string, string[]>>;

const greekScript = (s: string) => /[\u0370-\u03ff\u1f00-\u1fff]/.test(s);

/** The spelling words are compared by: Greek letters with their breathings and
 * accents, lowercase, a grave read as an acute (τὰ is τά before a pause), no
 * editorial dots, brackets, or daggers, and every elision mark as ’. */
export function accentKey(greek: string): string {
  return greek
    .replace(/^\*+/, '')
    .normalize('NFD')
    .toLowerCase()
    .replace(/\u0300/g, '\u0301')
    .replace(/\u0323/g, '')                 // an editor's dot under a doubtful letter
    .replace(/['\u02bc\u1fbd]/g, '\u2019')
    .replace(/[^\p{L}\p{M}\u2019]/gu, '')   // an editor's brackets, daggers, and punctuation
    .normalize('NFC');
}

// A spelling with no breathing or accent: how a reader types who leaves the
// marks off, so it must never narrow, even where it is a real printed form
// (the enclitic τα). Its tokens still count as claiming their keys.
const unmarked = (spelled: string) => !/[\u0300-\u036f]/.test(spelled.normalize('NFD'));

/** One work's lemma index (key → [segment index, token position] postings) and
 * the printed word at a posting, undefined where it cannot be read. */
export interface IndexedWork {
  lemmaIndex: Record<string, [number, number][]>;
  wordAt: (segment: number, position: number) => string | undefined;
}

/** Build the table from the search index.
 *
 * For each folded spelling, the keys the search would take are the bare fold
 * and the lemma map's keys (the plays' map holds [key, beta] pairs). A printed
 * spelling narrows those to the keys the index gave its tokens, plus every key
 * no token of that folded spelling carries (the index gives no evidence
 * against it). Only narrowings that drop something are kept. `missing` counts
 * postings whose word could not be read: the caller decides whether a build
 * may go on without them. */
export function buildLemmaAccents(
  works: Iterable<IndexedWork>,
  lemmaMap: Record<string, (string | string[])[]>,
  fold: (s: string) => string,
): { table: LemmaAccents; missing: number; postings: number } {
  const owned = new Map<string, Map<string, Set<string>>>();   // fold → spelling → keys
  const claimed = new Map<string, Set<string>>();             // fold → keys any token carries
  let missing = 0, postings = 0;
  for (const work of works) {
    for (const [key, posts] of Object.entries(work.lemmaIndex)) {
      for (const [si, pos] of posts) {
        postings++;
        const word = work.wordAt(si, pos);
        if (!word) { missing++; continue; }
        const f = fold(word);
        if (!f) continue;
        const spelled = accentKey(word);
        (claimed.get(f) ?? claimed.set(f, new Set()).get(f)!).add(key);
        const bySpelling = owned.get(f) ?? owned.set(f, new Map()).get(f)!;
        (bySpelling.get(spelled) ?? bySpelling.set(spelled, new Set()).get(spelled)!).add(key);
      }
    }
  }
  const table: LemmaAccents = {};
  for (const [f, bySpelling] of owned) {
    const universe = [...new Set([f, ...(lemmaMap[f] ?? []).map(k => (Array.isArray(k) ? k[0] : k))])];
    if (universe.length < 2) continue;
    const anyToken = claimed.get(f)!;
    const narrowing: Record<string, string[]> = {};
    for (const [spelled, keys] of bySpelling) {
      if (unmarked(spelled)) continue;
      const kept = universe.filter(k => keys.has(k) || !anyToken.has(k));
      if (kept.length < universe.length) narrowing[spelled] = kept;
    }
    if (Object.keys(narrowing).length) table[f] = narrowing;
  }
  return { table, missing, postings };
}

/** The keys a typed word's accents leave of `keys` (what the search would
 * otherwise take for its folded spelling), or null where they decide nothing:
 * an unmarked or unprinted spelling, a fold with no entry, or an entry that
 * leaves none of `keys`. */
export function narrowByAccent(
  table: LemmaAccents,
  typed: string,
  fold: string,
  keys: string[],
): string[] | null {
  const entry = table[fold];
  if (!entry) return null;
  const bare = typed.replace(/^\*+/, '');
  const greek = greekScript(bare) ? bare : betaQueryToGreek(bare);
  const spelled = accentKey(greek);
  if (unmarked(spelled)) return null;
  const kept = entry[spelled];
  if (!kept) return null;
  const left = keys.filter(k => kept.includes(k));
  return left.length && left.length < keys.length ? left : null;
}
