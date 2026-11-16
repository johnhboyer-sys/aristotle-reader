// The English phrases around a search's hits, to set aside (John, 16 Nov:
// "showing users common phrases with the english word"). A phrase is a run of
// three words that holds a hit ("Three-word runs"); the list offers each run
// that at least five hits stand in, most first, and setting one aside drops
// every hit inside it. There is no Include: an exact-phrase search does that
// ("why doesn't the user just search that exact phrase").

import { englishWords } from './search';

/** A passage's words, lower-cased, as the index counts them; `stops[i]` is
 *  true where a sentence mark stands between word i and the next. */
export interface PhraseText { words: string[]; stops: boolean[] }

/** One English hit: the passage it stands in and its word's place there. */
export interface PhraseHit { text: PhraseText; at: number }

export interface PhraseRow { phrase: string; n: number }

export const PHRASE_WORDS = 3;
export const PHRASE_MIN = 5;

/** The words of a translation's pieces of one passage, in order, counted on
 *  through the pieces as the index counts them: one text, cut where the
 *  passage cuts it. A run does not cross a sentence mark. */
export function phraseText(pieces: string[]): PhraseText {
  const words: string[] = [];
  const stops: boolean[] = [];
  const mark = (between: string) => /[.;:!?]/.test(between);
  pieces.forEach(piece => {
    const found = englishWords(piece);
    // A sentence mark ahead of a piece's first word ends the run before it.
    if (found.length && stops.length && mark(piece.slice(0, found[0].start))) stops[stops.length - 1] = true;
    found.forEach((w, i) => {
      words.push(w.word.toLowerCase());
      const next = found[i + 1];
      stops.push(next ? mark(piece.slice(w.end, next.start)) : mark(piece.slice(w.end)));
    });
  });
  if (stops.length) stops[stops.length - 1] = true;
  return { words, stops };
}

/** The three-word runs that hold word `at`. */
export function runsAt({ words, stops }: PhraseText, at: number): string[] {
  const out: string[] = [];
  for (let a = at - PHRASE_WORDS + 1; a <= at; a++) {
    const b = a + PHRASE_WORDS - 1;
    if (a < 0 || b >= words.length) continue;
    if (stops.slice(a, b).some(Boolean)) continue;
    out.push(words.slice(a, b + 1).join(' '));
  }
  return out;
}

/** True where a hit stands in a phrase set aside. */
export function setAside(hit: PhraseHit, aside: ReadonlySet<string>): boolean {
  return aside.size > 0 && runsAt(hit.text, hit.at).some(r => aside.has(r));
}

/** The phrases offered, in the order of their hits before anything is set
 *  aside (then A–Z), so the rows keep their places; each counts its hits not
 *  inside another phrase set aside, so setting one aside lowers the phrases
 *  that overlap it ("virtue of the" loses the hits "in virtue of" holds). */
export function phraseRows(hits: PhraseHit[], aside: ReadonlySet<string>, min = PHRASE_MIN): PhraseRow[] {
  const before = new Map<string, number>();
  const after = new Map<string, number>();
  for (const hit of hits) {
    const runs = new Set(runsAt(hit.text, hit.at));
    const out = [...runs].filter(r => aside.has(r));
    for (const r of runs) {
      before.set(r, (before.get(r) ?? 0) + 1);
      if (!out.some(x => x !== r)) after.set(r, (after.get(r) ?? 0) + 1);
    }
  }
  return [...before]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phrase]) => ({ phrase, n: after.get(phrase) ?? 0 }));
}
