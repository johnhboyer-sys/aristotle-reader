import { describe, expect, it } from 'vitest';
import { snapWordImport } from '../import-align';
import { snapWord } from '../engine';

// §G of ocr-repair/stage6-fixes-2-spec.md: a Bekker tag emitted at a
// paragraph boundary must anchor the FOLLOWING paragraph's first word, never
// snap backward onto the previous paragraph's last word (the stored 83b1
// anchor in Barnes APo pointed at "truly." instead of "Either a term").

describe('snapWordImport', () => {
  const text =
    'make a true statement, but it is not possible to counterpredicate truly.\n' +
    'Either a term will be predicated as a substance, i.e. being either the kind';
  const eitherAt = text.indexOf('Either');
  const newlineAt = text.indexOf('\n');

  it('keeps an offset already at the paragraph-opening word', () => {
    expect(snapWordImport(text, eitherAt)).toBe(eitherAt);
  });

  it('snaps an offset on the newline forward to the paragraph-opening word', () => {
    expect(snapWordImport(text, newlineAt)).toBe(eitherAt);
  });

  it('regression: engine.snapWord pulled the same offsets backward across the break', () => {
    // Documents the defect this wrapper exists for — if engine behavior ever
    // changes to pass this, the wrapper can be reconsidered (engine is
    // parity-locked, so this should stay red for engine).
    const trulyAt = text.indexOf('truly.');
    expect(snapWord(text, newlineAt)).toBe(trulyAt);
  });

  it('matches engine.snapWord for mid-paragraph offsets', () => {
    for (const probe of ['possible', 'statement', 'predicated']) {
      const off = text.indexOf(probe) + 3;
      expect(snapWordImport(text, off)).toBe(snapWord(text, off));
    }
  });

  it('never crosses a newline even when the nearer boundary lies beyond it', () => {
    const t = 'one two\nthree four';
    const off = t.indexOf('hree'); // mid-word "three", nearest space is across the break
    expect(snapWordImport(t, off)).toBe(t.indexOf('three'));
  });

  it('clamps at the text edges', () => {
    expect(snapWordImport(text, 0)).toBe(0);
    expect(snapWordImport(text, text.length)).toBe(text.length);
    expect(snapWordImport(text, text.length + 50)).toBe(text.length);
  });
});
