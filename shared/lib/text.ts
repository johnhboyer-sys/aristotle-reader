function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function searchTermPrefix(term: string): string {
  return term.trim().replace(/\*+$/g, '');
}

export function highlightPrefixMatches(text: string, terms: string[]): string {
  const cleaned = terms.map(searchTermPrefix).filter(Boolean);
  if (!cleaned.length) return esc(text);
  // Match on the RAW text in a single pass, then escape each segment as we build
  // the output. Escaping first and looping term-by-term (the old approach) let a
  // later term match the `<mark>` tags or `&amp;` entities inserted by an earlier
  // term — e.g. a second term starting with "m" ("mind") matched the injected
  // "<mark>", corrupting the markup. One pass over the source can't re-enter its
  // own output.
  const alt = cleaned.map(escapeRe).join('|');
  const re = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])((?:${alt})[\\p{L}\\p{M}\\p{N}_]*)`, 'giu');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    out += esc(text.slice(last, start));
    out += esc(m[1]) + '<mark>' + esc(m[2]) + '</mark>';
    last = start + m[0].length;
  }
  out += esc(text.slice(last));
  return out;
}
