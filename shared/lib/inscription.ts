// Greek as an Attic letter-cutter wrote it: capitals with no accents or
// breathings, and an iota subscript written out as a full iota (ΤΗΙ ΘΕΩΙ).
// Used for the redesign's inscription lettering: the stoichedon grids, Greek
// titles in capitals.
//
// Order matters: decompose, THEN uppercase — U+0345 (the subscript iota as a
// combining mark) uppercases to a capital iota — and only then drop the
// remaining combining marks.
export function inscriptionCaps(s: string): string {
  return s.normalize('NFD').toUpperCase().replace(/[̀-ͯ]/g, '').normalize('NFC');
}

// The letters alone, for a stoichedon grid: no spaces, no punctuation, no
// editorial brackets — one capital per cell.
export function inscriptionLetters(s: string): string {
  return inscriptionCaps(s).replace(/[^Α-Ω]/g, '');
}
