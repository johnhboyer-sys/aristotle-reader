// The work page's facts list gives each edition as name and year only; the
// publisher and place go in the full entries at the foot of the page
// (John, 14 Nov 2026).

// "(Oxford, 1921)" → "(1921)"; "(Budé, 1964–69)" → "(1964–69)";
// "(Kegan Paul, rev. ed. 1893)" → "(1893)"; a reprint keeps the first date:
// "(1776; repr. 1912)" → "(1776)". Anything without a year is returned as is.
export function yearOnly(paren: string): string {
  const inner = paren.replace(/^\(|\)$/g, '');
  const first = inner.split(/;\s*repr\./)[0];
  const year = first.match(/(\d{4}(?:[–-]\d{2,4})?)\s*$/)?.[1];
  return year ? `(${year})` : paren;
}

// "Ross (OCT, 1957)" → "Ross (1957)"; "Fobes (1919)" → "Fobes (1919)".
export function nameYear(short: string): string {
  const m = short.match(/^(.*?) (\(.*\))$/);
  return m ? `${m[1]} ${yearOnly(m[2])}` : short;
}
