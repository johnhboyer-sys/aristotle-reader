/**
 * The letter a book's printed title reduces to.
 *
 * The Greek tradition letters Aristotle's books, and the editions the disc
 * exports print that letter as the book's title line: the Physics runs
 * "ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α", then "Β.", "Γ.", "Δ." — the work's name once, and the
 * letter alone after that. The Politics, Topics, Meteorologica, De anima and
 * Rhetoric all do the same.
 *
 * Two callers need the same reading of those lines: the importer, which labels
 * a Book "Book Α" rather than "Book 1", and the rail, which then has no reason
 * to print the title line under the Book that was named after it.
 *
 * Everything else reduces to null, and gets a number instead — the Oeconomica
 * titles its books ΠΡΩΤΟΣ and ΔΕΥΤΕΡΟΣ, in words, and the letters of the
 * Epistulae are letters in the other sense (Φιλίππῳ, "to Philip").
 */

/** Α–Ω, the capitals a book is lettered with. Accented forms are not book
 * letters, and lowercase α (the Metaphysics' "little alpha") is a book of its
 * own that the numbering here cannot express — both fall through to null. */
const BOOK_LETTER = /^[Α-Ω]$/;

/** Trailing marks a printed title carries: "Β." and "Γ·" are still Β and Γ. */
const TRAILING_PUNCTUATION = /[.·,:;]+$/;

export function bookLetterOf(title: string): string | null {
  const tokens = title.trim().split(/\s+/);
  const last = tokens[tokens.length - 1]?.replace(TRAILING_PUNCTUATION, '') ?? '';
  return BOOK_LETTER.test(last) ? last : null;
}

/**
 * True when a Book's label and an outline root say the same thing — the Book
 * "Book Α" and the title line "ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α" it was named after. The
 * rail prints one of them, not both.
 *
 * Deliberately narrow: it compares LETTERS, so a hand-made Book called "Prima
 * Pars" over a chapter called "Quaestio 2" matches nothing and both stay.
 */
export function labelsSameBook(bookLabel: string, rootLabel: string): boolean {
  const letter = bookLetterOf(bookLabel);
  return letter !== null && letter === bookLetterOf(rootLabel);
}
