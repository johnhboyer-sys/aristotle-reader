// viewPolicy — single source of truth for view-mode legality (D8,
// workbench-design/d8-view-modes.md §5). Matrix test over every
// (rowUnit, spineSource) combination the policy is keyed on.
import { describe, expect, it } from 'vitest';
import type { CitationScheme } from '../../citation/types';
import { defaultView, legalViews } from '../viewPolicy';
import { bekkerStandard } from '../../citation/schemes/bekkerStandard';
import { busseParagraph } from '../../citation/schemes/busseParagraph';
import { paragraphScheme } from '../../citation/schemes/paragraphScheme';
import { plainLineScheme } from '../../citation/schemes/plainLineScheme';
import { aquinasStub } from '../../citation/schemes/aquinasStub';

describe('viewPolicy matrix (keyed only on rowUnit/spineSource)', () => {
  it('bekker-line (corpus) → grid, interpolated; default grid — existing behavior unchanged', () => {
    expect(legalViews(bekkerStandard)).toEqual(['grid', 'interpolated']);
    expect(defaultView(bekkerStandard)).toBe('grid');
  });

  it('paragraph + corpus (busse) → grid, paragraph, interpolated; default paragraph', () => {
    expect(legalViews(busseParagraph)).toEqual(['grid', 'paragraph', 'interpolated']);
    expect(defaultView(busseParagraph)).toBe('paragraph');
  });

  it('paragraph + document → paragraph, interpolated; default paragraph', () => {
    expect(legalViews(paragraphScheme)).toEqual(['paragraph', 'interpolated']);
    expect(defaultView(paragraphScheme)).toBe('paragraph');
  });

  it('plain-line → grid, interpolated, paragraph; default grid', () => {
    expect(legalViews(plainLineScheme)).toEqual(['grid', 'interpolated', 'paragraph']);
    expect(defaultView(plainLineScheme)).toBe('grid');
  });

  it('anything else (e.g. aquinas-tbd: paragraph + corpus is already covered above; use a synthetic sentence rowUnit) → grid only; default grid', () => {
    // aquinas-tbd is actually rowUnit 'paragraph' + spineSource 'corpus',
    // which is covered by the busse case above and would return the same
    // result. Exercise the true fallback arm with a synthetic scheme whose
    // capabilities don't match any named case (rowUnit 'sentence').
    const synthetic: CitationScheme = {
      ...aquinasStub,
      gutter: { rowUnit: 'sentence', gutterMode: 'structural' },
      spineSource: 'corpus',
    };
    expect(legalViews(synthetic)).toEqual(['grid']);
    expect(defaultView(synthetic)).toBe('grid');
  });

  it('aquinas-tbd itself (paragraph + corpus stub) also resolves via the busse-shaped arm', () => {
    expect(legalViews(aquinasStub)).toEqual(['grid', 'paragraph', 'interpolated']);
    expect(defaultView(aquinasStub)).toBe('paragraph');
  });
});
