import { describe, expect, it } from 'vitest';
import { proposeSplits } from '../assign';

describe('proposeSplits — no structure', () => {
  it('returns a single unassigned block when no headings/markers are found', () => {
    const text = 'Just some plain prose with no headings at all.';
    const blocks = proposeSplits(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({ book: null, chapter: null, text });
  });

  it('trims the single fallback block', () => {
    const blocks = proposeSplits('\n\n  plain text  \n\n');
    expect(blocks).toEqual([{ book: null, chapter: null, text: 'plain text' }]);
  });
});

describe('proposeSplits — Markdown headings', () => {
  it('detects a Book heading followed by Chapter headings', () => {
    const text = [
      '# Book 7',
      '## Chapter 17',
      'We have to inquire what substance is.',
      '## 18',
      'Text of chapter eighteen.',
    ].join('\n');
    const blocks = proposeSplits(text);
    expect(blocks).toEqual([
      { book: 7, chapter: 17, text: 'We have to inquire what substance is.' },
      { book: 7, chapter: 18, text: 'Text of chapter eighteen.' },
    ]);
  });

  it('carries the current book forward across multiple chapters', () => {
    const text = ['# Book 1', '### Chapter 1', 'One.', '### Chapter 2', 'Two.'].join('\n');
    const blocks = proposeSplits(text);
    expect(blocks.map((b) => b.book)).toEqual([1, 1]);
    expect(blocks.map((b) => b.chapter)).toEqual([1, 2]);
  });

  it('a bare chapter heading with no preceding Book heading is not detected as structure', () => {
    const text = ['## 17', 'Some text.'].join('\n');
    const blocks = proposeSplits(text);
    // No Book context and no inline marker — falls through untouched by
    // headings detection, so the whole thing is the single fallback block.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].book).toBeNull();
  });

  it('starting a new Book heading resets the chapter context for a second work section', () => {
    const text = ['# Book 1', '## 1', 'Book one chapter one.', '# Book 2', '## 1', 'Book two chapter one.'].join(
      '\n',
    );
    const blocks = proposeSplits(text);
    expect(blocks).toEqual([
      { book: 1, chapter: 1, text: 'Book one chapter one.' },
      { book: 2, chapter: 1, text: 'Book two chapter one.' },
    ]);
  });
});

describe('proposeSplits — inline [book.chapter] markers', () => {
  it('detects an inline marker independent of any Book heading', () => {
    const text = ['[7.17] We have to inquire what substance is.', '[7.18] Second chapter text.'].join(
      '\n',
    );
    const blocks = proposeSplits(text);
    expect(blocks).toEqual([
      { book: 7, chapter: 17, text: 'We have to inquire what substance is.' },
      { book: 7, chapter: 18, text: 'Second chapter text.' },
    ]);
  });

  it('includes subsequent lines up to the next marker/heading in the block body', () => {
    const text = ['[7.17] First line.', 'Second line of the same chapter.', '[7.18] Next chapter.'].join(
      '\n',
    );
    const blocks = proposeSplits(text);
    expect(blocks[0].text).toBe('First line.\nSecond line of the same chapter.');
    expect(blocks[1].text).toBe('Next chapter.');
  });
});

describe('proposeSplits — empty blocks are dropped', () => {
  it('drops a heading with no body text', () => {
    const text = ['# Book 7', '## 17', 'Real content.', '## 18', ''].join('\n');
    const blocks = proposeSplits(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].chapter).toBe(17);
  });
});
