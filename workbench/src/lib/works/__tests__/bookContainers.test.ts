import { describe, expect, it } from 'vitest';
import {
  MAX_BOOK_CONTAINERS,
  normalizeContainers,
  sanitizeContainers,
  withAddedBookContainer,
  withBookStartAt,
  withInsertedBookContainerAfter,
  withRemovedBookContainer,
  withRenamedBookContainer,
} from '../bookContainers';
import type { BookContainer } from '../bookContainers';

describe('Book containers', () => {
  it('normalizes the first boundary, bad starts, order, and the defensive cap', () => {
    const input = [
      { label: 'I', start: 20 },
      { label: 'II', start: 3 },
      { label: 'III', start: -4 },
      { label: 'IV', start: 2.5 },
      ...Array.from({ length: MAX_BOOK_CONTAINERS }, (_, i) => ({
        label: `extra ${i}`,
        start: i + 4,
      })),
    ];
    const normalized = normalizeContainers(input);
    expect(normalized.slice(0, 5)).toEqual([
      { label: 'I', start: 1 },
      { label: 'II', start: 3 },
      { label: 'III', start: 3 },
      { label: 'IV', start: 3 },
      { label: 'extra 0', start: 4 },
    ]);
    expect(normalized).toHaveLength(MAX_BOOK_CONTAINERS);
    expect(input[0].start).toBe(20);
    expect(normalizeContainers([])).toEqual([]);
  });

  it('sanitizes registry garbage without throwing', () => {
    expect(sanitizeContainers({ books: 'nope' })).toBeUndefined();
    expect(sanitizeContainers([null, 'nope'])).toBeUndefined();
    expect(
      sanitizeContainers([
        { label: 'I', start: -10 },
        { label: 42, start: 8 },
        { label: 'III', start: 3 },
        { start: Number.NaN },
      ]),
    ).toEqual([
      { label: 'I', start: 1 },
      { label: '', start: 8 },
      { label: 'III', start: 8 },
      { label: '', start: 8 },
    ]);
  });

  it('makes the first added Book wrap all existing roots and later Books trail empty', () => {
    const first = withAddedBookContainer([], 'Prima Pars', 6);
    expect(first).toEqual([{ label: 'Prima Pars', start: 1 }]);

    const second = withAddedBookContainer(first, 'Secunda Pars', 6);
    expect(second).toEqual([
      { label: 'Prima Pars', start: 1 },
      { label: 'Secunda Pars', start: 7 },
    ]);
  });

  it('inserts an empty Book at the following boundary, or after the last root', () => {
    const books: BookContainer[] = [
      { label: 'I', start: 1 },
      { label: 'III', start: 5 },
    ];
    expect(withInsertedBookContainerAfter(books, 0, 'II', 8)).toEqual([
      { label: 'I', start: 1 },
      { label: 'II', start: 5 },
      { label: 'III', start: 5 },
    ]);
    expect(withInsertedBookContainerAfter(books, 1, 'IV', 8)).toEqual([
      { label: 'I', start: 1 },
      { label: 'III', start: 5 },
      { label: 'IV', start: 9 },
    ]);
  });

  it('"start here" clamps earlier Books down and later Books up', () => {
    const books: BookContainer[] = [
      { label: 'I', start: 1 },
      { label: 'II', start: 5 },
      { label: 'III', start: 9 },
      { label: 'IV', start: 12 },
    ];
    expect(withBookStartAt(books, 2, 3).map((book) => book.start)).toEqual([1, 3, 3, 12]);
    expect(withBookStartAt(books, 1, 10).map((book) => book.start)).toEqual([1, 10, 10, 12]);
  });

  it('leaves the first Book alone — it always begins at the document top', () => {
    // Clamping the first Book back to 1 (correct) while pushing later Books
    // forward would drag chapters out of a Book the user never touched, so
    // "begin here" on the first Book is a no-op instead of a move.
    const books: BookContainer[] = [
      { label: 'Prima', start: 1 },
      { label: 'Secunda', start: 4 },
    ];
    expect(withBookStartAt(books, 0, 7)).toEqual(books);
  });

  it('treats an out-of-range index as a no-op that still normalizes', () => {
    const books: BookContainer[] = [
      { label: 'I', start: 3 },
      { label: 'II', start: 2 },
    ];
    const expected = [
      { label: 'I', start: 1 },
      { label: 'II', start: 2 },
    ];
    expect(withBookStartAt(books, 9, 4)).toEqual(expected);
    expect(withBookStartAt(books, -1, 4)).toEqual(expected);
    expect(withInsertedBookContainerAfter(books, 9, 'III', 6)).toEqual(expected);
    expect(withRenamedBookContainer(books, 9, 'nope')).toEqual(books);
  });

  it('removing a later Book merges its roots into the Book before it', () => {
    expect(
      withRemovedBookContainer(
        [
          { label: 'I', start: 1 },
          { label: 'II', start: 5 },
          { label: 'III', start: 9 },
        ],
        1,
      ),
    ).toEqual([
      { label: 'I', start: 1 },
      { label: 'III', start: 9 },
    ]);
  });

  it('trims whitespace-only labels so a Book never renders as a blank row', () => {
    expect(sanitizeContainers([{ label: '  Prima Pars ', start: 1 }, { label: '   ', start: 2 }])).toEqual([
      { label: 'Prima Pars', start: 1 },
      { label: '', start: 2 },
    ]);
  });

  it('removing the first Book re-clamps the new first boundary to 1', () => {
    expect(
      withRemovedBookContainer(
        [
          { label: 'I', start: 1 },
          { label: 'II', start: 5 },
        ],
        0,
      ),
    ).toEqual([{ label: 'II', start: 1 }]);
  });

  it('renames without mutating the input', () => {
    const books: BookContainer[] = [
      { label: 'I', start: 1 },
      { label: 'II', start: 4 },
    ];
    const renamed = withRenamedBookContainer(books, 1, 'Secunda Pars');
    expect(renamed).toEqual([
      { label: 'I', start: 1 },
      { label: 'Secunda Pars', start: 4 },
    ]);
    expect(books[1].label).toBe('II');
    expect(renamed).not.toBe(books);
  });
});
