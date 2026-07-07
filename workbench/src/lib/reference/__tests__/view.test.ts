import { describe, expect, it } from 'vitest';
import { referenceForSelection } from '../view';

describe('referenceForSelection', () => {
  it('splits on blank lines into paragraphs with positional ids', () => {
    const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
    const view = referenceForSelection(text);
    expect(view.mode).toBe('chapter');
    if (view.mode !== 'chapter') throw new Error('expected chapter mode');
    expect(view.paragraphs).toEqual([
      { id: 'p0', text: 'First paragraph.' },
      { id: 'p1', text: 'Second paragraph.' },
      { id: 'p2', text: 'Third paragraph.' },
    ]);
  });

  it('is deterministic: the same input yields the same ids across calls', () => {
    const text = 'Alpha.\n\nBeta.\n\nGamma.';
    const first = referenceForSelection(text);
    const second = referenceForSelection(text);
    expect(first).toEqual(second);
  });

  it('drops empty blocks from extra blank-line runs', () => {
    const text = 'First.\n\n\n\nSecond.';
    const view = referenceForSelection(text);
    if (view.mode !== 'chapter') throw new Error('expected chapter mode');
    expect(view.paragraphs.map((p) => p.text)).toEqual(['First.', 'Second.']);
    expect(view.paragraphs.map((p) => p.id)).toEqual(['p0', 'p1']);
  });

  it('returns an empty paragraph list for empty input', () => {
    const view = referenceForSelection('');
    if (view.mode !== 'chapter') throw new Error('expected chapter mode');
    expect(view.paragraphs).toEqual([]);
  });

  it('a single-paragraph chapter gets id p0', () => {
    const view = referenceForSelection('Just one paragraph, no blank lines.');
    if (view.mode !== 'chapter') throw new Error('expected chapter mode');
    expect(view.paragraphs).toEqual([{ id: 'p0', text: 'Just one paragraph, no blank lines.' }]);
  });
});
