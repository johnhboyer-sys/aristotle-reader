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
  if (!terms.length) return esc(text);
  let out = esc(text);
  for (const term of terms) {
    const clean = searchTermPrefix(term);
    if (!clean) continue;
    const re = new RegExp(`(^|[^\\p{L}\\p{M}\\p{N}_])(${escapeRe(clean)}[\\p{L}\\p{M}\\p{N}_]*)`, 'giu');
    out = out.replace(re, '$1<mark>$2</mark>');
  }
  return out;
}
