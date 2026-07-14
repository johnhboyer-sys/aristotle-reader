// Interpolated-view policy + display helpers (D8 §5) — the pure module
// behind ChapterEditor's interpolated view: which layer the field edits
// (usesParaLayer), when the granularity sub-toggle is offered
// (showGranularityToggle), and how a unit's original text slices at its
// sentence divisions (sourceSlices).
import { describe, expect, it } from 'vitest';

import { usesParaLayer, showGranularityToggle, sourceSlices, sourceSliceSpans, sourceOffsetAtDisplay } from '../interpolated';
import { paragraphScheme } from '../../citation/schemes/paragraphScheme';
import { plainLineScheme } from '../../citation/schemes/plainLineScheme';
import { bekkerStandard } from '../../citation/schemes/bekkerStandard';
import { busseParagraph } from '../../citation/schemes/busseParagraph';

describe('usesParaLayer — which English layer the active view edits (§4)', () => {
  it('paragraph docs in the paragraph view edit englishPara (D1 semantics unchanged)', () => {
    expect(usesParaLayer(paragraphScheme, 'paragraph', 'unit')).toBe(true);
    expect(usesParaLayer(paragraphScheme, 'paragraph', 'sentence')).toBe(true); // granularity is interpolated-only
  });

  it("paragraph docs interpolated at 'unit' granularity edit englishPara; 'sentence' edits the sentence layer", () => {
    expect(usesParaLayer(paragraphScheme, 'interpolated', 'unit')).toBe(true);
    expect(usesParaLayer(paragraphScheme, 'interpolated', 'sentence')).toBe(false);
  });

  it('line-based docs NEVER edit the paragraph layer (their unit is the line)', () => {
    expect(usesParaLayer(plainLineScheme, 'interpolated', 'unit')).toBe(false);
    expect(usesParaLayer(plainLineScheme, 'interpolated', 'sentence')).toBe(false);
    expect(usesParaLayer(plainLineScheme, 'paragraph', 'unit')).toBe(false); // chunked line view stays line-based
    expect(usesParaLayer(bekkerStandard, 'interpolated', 'unit')).toBe(false);
    expect(usesParaLayer(bekkerStandard, 'grid', 'unit')).toBe(false);
  });

  it('the grid view always edits the sentence layer', () => {
    expect(usesParaLayer(paragraphScheme, 'grid', 'unit')).toBe(false);
    expect(usesParaLayer(busseParagraph, 'grid', 'unit')).toBe(false);
  });

  it('a corpus-spine paragraph doc (Busse) mirrors its paragraph view: unit interpolation edits englishPara', () => {
    expect(usesParaLayer(busseParagraph, 'paragraph', 'unit')).toBe(true);
    expect(usesParaLayer(busseParagraph, 'interpolated', 'unit')).toBe(true);
    expect(usesParaLayer(busseParagraph, 'interpolated', 'sentence')).toBe(false);
  });
});

describe('showGranularityToggle — offered only where two granularities are meaningful (§5)', () => {
  it('interpolated view of a document-spine paragraph doc → shown', () => {
    expect(showGranularityToggle(paragraphScheme, 'interpolated')).toBe(true);
  });

  it('every other view mode → hidden (granularity is an interpolated concept)', () => {
    expect(showGranularityToggle(paragraphScheme, 'paragraph')).toBe(false);
    expect(showGranularityToggle(paragraphScheme, 'grid')).toBe(false);
  });

  it('line-based docs interpolate by line — no toggle', () => {
    expect(showGranularityToggle(plainLineScheme, 'interpolated')).toBe(false);
    expect(showGranularityToggle(bekkerStandard, 'interpolated')).toBe(false);
  });

  it('corpus-spine paragraph docs (Busse) also offer the toggle', () => {
    expect(showGranularityToggle(busseParagraph, 'interpolated')).toBe(true);
  });
});

describe('sourceSlices — a unit’s original divided at its sentence boundaries (§2)', () => {
  const text = 'πρῶτον μὲν οὖν. δεύτερον δέ· τρίτον τέλος.';
  //            0         1         2         3
  //            0123456789012345678901234567890123456789012
  // offsets at the starts of the 2nd + 3rd sentences (word starts):
  const afterFirst = text.indexOf('δεύτερον');
  const afterSecond = text.indexOf('τρίτον');

  it('no offsets → one trimmed slice (the whole unit)', () => {
    expect(sourceSlices('  some text  ')).toEqual(['some text']);
    expect(sourceSlices(text, [])).toEqual([text]);
  });

  it('offsets slice the source into trimmed sentence pieces, in order', () => {
    expect(sourceSlices(text, [afterFirst, afterSecond])).toEqual([
      'πρῶτον μὲν οὖν.',
      'δεύτερον δέ·',
      'τρίτον τέλος.',
    ]);
  });

  it('unsorted / duplicate offsets are normalized (drift-safe)', () => {
    expect(sourceSlices(text, [afterSecond, afterFirst, afterFirst])).toEqual([
      'πρῶτον μὲν οὖν.',
      'δεύτερον δέ·',
      'τρίτον τέλος.',
    ]);
  });

  it('out-of-range / zero / non-integer offsets are ignored, never thrown', () => {
    expect(sourceSlices(text, [0, -3, text.length, text.length + 10, 2.5])).toEqual([text]);
  });

  it('empty slices from adjacent boundaries are dropped; an empty source yields one empty slice', () => {
    expect(sourceSlices('ab  cd', [2, 3])).toEqual(['ab', 'cd']); // middle slice is whitespace-only
    expect(sourceSlices('')).toEqual(['']);
    expect(sourceSlices('   ')).toEqual(['']);
  });
});

describe('sourceSliceSpans + sourceOffsetAtDisplay — display↔model offset mapping (refinement pass)', () => {
  const text = 'πρῶτον μὲν οὖν. δεύτερον δέ· τρίτον τέλος.';
  const afterFirst = text.indexOf('δεύτερον'); // slice trims the boundary space
  const afterSecond = text.indexOf('τρίτον');

  it('spans carry the model offset of each trimmed slice', () => {
    expect(sourceSliceSpans(text, [afterFirst, afterSecond])).toEqual([
      { text: 'πρῶτον μὲν οὖν.', start: 0 },
      { text: 'δεύτερον δέ·', start: afterFirst },
      { text: 'τρίτον τέλος.', start: afterSecond },
    ]);
    // leading whitespace shifts the span start, not its text
    expect(sourceSliceSpans('  ab cd  ')).toEqual([{ text: 'ab cd', start: 2 }]);
    expect(sourceSliceSpans('')).toEqual([{ text: '', start: 0 }]);
  });

  it('sourceSlices stays exactly the spans’ texts (behavior unchanged)', () => {
    expect(sourceSlices(text, [afterSecond, afterFirst, afterFirst])).toEqual(
      sourceSliceSpans(text, [afterFirst, afterSecond]).map((s) => s.text),
    );
  });

  it('a display offset maps back through trimmed, separator-joined slices', () => {
    // display = 'πρῶτον μὲν οὖν.' + 'δεύτερον δέ·' + 'τρίτον τέλος.' (no separators text)
    const first = 'πρῶτον μὲν οὖν.';
    // inside the first slice: identity
    expect(sourceOffsetAtDisplay(text, [afterFirst, afterSecond], 3)).toBe(3);
    // exactly at the join: resolves to the NEXT slice's start — the click
    // was on the left edge of its first word; the earlier slice's trimmed
    // end may sit mid-whitespace where the word snap would fail
    expect(sourceOffsetAtDisplay(text, [afterFirst, afterSecond], first.length)).toBe(afterFirst);
    // one past the join = one INTO the second slice
    expect(sourceOffsetAtDisplay(text, [afterFirst, afterSecond], first.length + 1)).toBe(afterFirst + 1);
    // inside the third slice
    const displayThirdStart = first.length + 'δεύτερον δέ·'.length;
    expect(sourceOffsetAtDisplay(text, [afterFirst, afterSecond], displayThirdStart + 2)).toBe(afterSecond + 2);
  });

  it('offsets beyond the display text (or negative) are null', () => {
    expect(sourceOffsetAtDisplay(text, undefined, text.length + 1)).toBeNull();
    expect(sourceOffsetAtDisplay(text, undefined, -1)).toBeNull();
    expect(sourceOffsetAtDisplay(text, undefined, text.length)).toBe(text.length);
  });

  it('leading trim on an undivided slice shifts the mapping', () => {
    expect(sourceOffsetAtDisplay('  ab cd', undefined, 0)).toBe(2);
    expect(sourceOffsetAtDisplay('  ab cd', undefined, 3)).toBe(5);
  });

  it('a whitespace-only join (no punctuation) still maps the join click to the next word — adversarial-review regression', () => {
    // 'α β' split at β: display = 'α' + 'β'; a click at display offset 1
    // (the visible start of β) must map to β's model offset, where
    // snapToWordStart succeeds — not to the space after α, where it fails.
    const src = 'α β';
    expect(sourceSliceSpans(src, [2])).toEqual([
      { text: 'α', start: 0 },
      { text: 'β', start: 2 },
    ]);
    expect(sourceOffsetAtDisplay(src, [2], 1)).toBe(2);
    // the final display end still resolves to the last slice's end
    expect(sourceOffsetAtDisplay(src, [2], 2)).toBe(3);
    expect(sourceOffsetAtDisplay(src, [2], 3)).toBeNull();
  });
});
