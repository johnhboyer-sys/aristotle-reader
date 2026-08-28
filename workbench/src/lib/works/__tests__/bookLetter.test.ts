/**
 * Reading a book's letter off the title line its edition prints — and knowing
 * when a Book and an outline root are saying the same thing.
 */
import { describe, expect, it } from 'vitest';
import { bookLetterOf, labelsSameBook } from '../bookLetter';

describe('the letter a printed title reduces to', () => {
  it('reads the letter that ends a full title', () => {
    // The first book of a work carries the work's name; the letter closes it.
    expect(bookLetterOf('ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α')).toBe('Α');
    expect(bookLetterOf('ΠΟΛΙΤΙΚΩΝ Α')).toBe('Α');
    expect(bookLetterOf('ΜΕΤΕΩΡΟΛΟΓΙΚΩΝ Α')).toBe('Α');
  });

  it('reads a bare letter, with or without the stop after it', () => {
    expect(bookLetterOf('Β.')).toBe('Β');
    expect(bookLetterOf('Γ')).toBe('Γ');
    expect(bookLetterOf('Θ·')).toBe('Θ');
  });

  it('refuses a title that names its book in words', () => {
    // The Oeconomica: "the first" and "the second", not Α and Β.
    expect(bookLetterOf('ΟΙΚΟΝΟΜΙΚΟΣ ΠΡΩΤΟΣ')).toBeNull();
    expect(bookLetterOf('ΟΙΚΟΝΟΜΙΚΟΣ ΔΕΥΤΕΡΟΣ')).toBeNull();
  });

  it('refuses a letter in the other sense', () => {
    // The Epistulae are addressed, not numbered.
    expect(bookLetterOf('Φιλίππῳ.')).toBeNull();
    expect(bookLetterOf('Ἀλεξάνδρῳ.')).toBeNull();
  });

  it('refuses lowercase and accented forms', () => {
    // The Metaphysics' "little alpha" is a book the lettering cannot express,
    // and an accented capital is a word, not a numeral.
    expect(bookLetterOf('α')).toBeNull();
    expect(bookLetterOf('Ἄλφα')).toBeNull();
    expect(bookLetterOf('')).toBeNull();
  });
});

describe('a Book and the title line it was named after', () => {
  it('matches the Book to its own title line', () => {
    expect(labelsSameBook('Book Α', 'ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α')).toBe(true);
    expect(labelsSameBook('Book Β', 'Β.')).toBe(true);
  });

  it('does not match a different book', () => {
    expect(labelsSameBook('Book Β', 'ΦΥΣΙΚΗΣ ΑΚΡΟΑΣΕΩΣ Α')).toBe(false);
  });

  it('leaves a hand-made Book and its chapters alone', () => {
    expect(labelsSameBook('Prima Pars', 'Quaestio 2')).toBe(false);
    expect(labelsSameBook('Book 1', 'ΟΙΚΟΝΟΜΙΚΟΣ ΠΡΩΤΟΣ')).toBe(false);
  });
});
