// Split a Greek line into clickable words and the verbatim text between them.
import type { GreekLine, Token } from './data';

export interface LinePart { text: string; tok: Token | null; }

// Editorial sigla the OCT prints INSIDE a word: angle brackets for a supplement
// (Cat 4b "ἀνακε<κλ>ίσθαι") and square brackets for a deletion
// (DM 981a "αὐτουργεῖ[ν]"). The token text is the bare word, so it does not
// occur verbatim in the line and a plain indexOf misses it.
const SIGLUM = /[<>[\]]/;
const OPENER = /[<[]/;
const CLOSER = /[>\]]/;

// Locate `t` in `text` at or after `from`, tolerating sigla printed inside the
// word, and return its VERBATIM span (sigla included) so the rendered line
// stays byte-identical to the source. Null when the word really isn't there.
export function locateToken(text: string, t: string, from: number): { start: number; end: number } | null {
  const plain = text.indexOf(t, from);
  if (plain >= 0) return { start: plain, end: plain + t.length };
  for (let s = from; s < text.length; s += 1) {
    if (text[s] !== t[0]) continue;
    let i = s;
    let k = 0;
    let open = 0; // brackets opened inside the word, still to be closed
    while (i < text.length && k < t.length) {
      if (text[i] === t[k]) { i += 1; k += 1; }
      else if (SIGLUM.test(text[i])) { open += OPENER.test(text[i]) ? 1 : -1; i += 1; }
      else break;
    }
    if (k !== t.length) continue;
    // A bracket still OPEN at the end of the word closes just past it
    // (Cat 4b "τὴ<ν>"): pull the closer in, or it renders as a gap detached
    // from its word. One that already closed mid-word (Cat 4b
    // "ἀνακε<κλ>ίσθαι") leaves nothing owing, so a closer sitting after the
    // word belongs to the phrase, not the word.
    while (open > 0 && i < text.length && CLOSER.test(text[i])) { open -= 1; i += 1; }
    return { start: s, end: i };
  }
  return null;
}

// The tokens hold bare words (for the popup lookup); the line `text` keeps the
// original punctuation AND the OCT editorial sigla ( ) [ ] < > † " — so we
// locate each word in `text` and render the gaps (sigla/punctuation) as plain,
// non-clickable text, preserving the critical edition faithfully.
export function lineParts(line: GreekLine | { text: string; tokens: Token[] }): LinePart[] {
  const parts: LinePart[] = [];
  const text = line.text;
  let ptr = 0;
  for (const tok of line.tokens) {
    const at = locateToken(text, tok.t, ptr);
    // Shouldn't happen. Emit nothing: the verbatim text still prints the word
    // in a later gap, so a phantom part here would print it TWICE. The word
    // just loses its click target.
    if (!at) continue;
    if (at.start > ptr) parts.push({ text: text.slice(ptr, at.start), tok: null });
    // `text` is the verbatim slice (sigla and all); `tok` carries the bare word
    // for the popup and the search-hit test.
    parts.push({ text: text.slice(at.start, at.end), tok });
    ptr = at.end;
  }
  if (ptr < text.length) parts.push({ text: text.slice(ptr), tok: null });
  return parts;
}

// Clickable parts for a table cell (same shape as a line: text + tokens).
export function cellParts(cell: { text: string; tokens: Token[] }): LinePart[] {
  return lineParts(cell);
}
