// Interpolated-view policy + display helpers (D8 §5) — the pure module
// behind ChapterEditor's interpolated view: which layer the field edits
// (usesParaLayer), when the granularity sub-toggle is offered
// (showGranularityToggle), and how a unit's original text slices at its
// sentence divisions (sourceSlices).
import { describe, expect, it } from 'vitest';

import { usesParaLayer, showGranularityToggle, sourceSlices } from '../interpolated';
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

  it('corpus-spine paragraph docs (Busse) stay at the row unit — no toggle', () => {
    expect(showGranularityToggle(busseParagraph, 'interpolated')).toBe(false);
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
