// Desktop citation labels for a chapter.section work (the Athenian
// Constitution): its synthetic column "49a" and line 3 print "49.3", and every
// other work keeps the label it had.
import { describe, expect, it, vi } from 'vitest';
import { annotationLabel, greekCiteForRange, segCiteForRange, type Annotation } from '../lib/annotations';

// The registry entry lands with the data, so the fixture is served beside the
// real works.
vi.mock('@shared/lib/works', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/works')>();
  const ATHPOL = { ...actual.getWork('Cat')!, id: 'AthPol', abbr: 'Ath. Pol.', citation: { scheme: 'chapter-section' as const } };
  return { ...actual, getWork: (id: string) => (id === 'AthPol' ? ATHPOL : actual.getWork(id)) };
});

const ATHPOL = { citation: { scheme: 'chapter-section' as const } };

const greekAnn = (work: string, column: string, a: number, b: number): Annotation => ({
  id: 'x', work, created: '', body: '', layer: 'greek', exact: '',
  target: { kind: 'greek', book: 1, start: { column, line: a, word: 0 }, end: { column, line: b, word: 0 } },
} as unknown as Annotation);
const engAnn = (work: string, column: string): Annotation => ({
  id: 'y', work, created: '', body: '', layer: 'translation:kenyon', exact: '',
  target: { kind: 'english', book: 1, column, translation: 'Kenyon', start: 0, end: 4 },
} as unknown as Annotation);

describe('annotationLabel', () => {
  it('prints chapter.section for a chapter-section work', () => {
    expect(annotationLabel(greekAnn('AthPol', '49a', 3, 3))).toBe('49.3');
    expect(annotationLabel(greekAnn('AthPol', '49a', 3, 4))).toBe('49.3–49.4');
    expect(annotationLabel(engAnn('AthPol', '49a'))).toBe('49 (Kenyon)');
  });
  it('keeps the old label for a Bekker work and the Isagoge', () => {
    expect(annotationLabel(greekAnn('EN', '1097a', 15, 15))).toBe('1097a15');
    expect(annotationLabel(greekAnn('EN', '1097a', 15, 17))).toBe('1097a15–1097a17');
    expect(annotationLabel(engAnn('EN', '1097a'))).toBe('1097a (Kenyon)');
    expect(annotationLabel(greekAnn('Isa', '1a', 3, 3))).toBe('1a3');
  });
});

function rangeOver(html: string, sel: string): Range {
  document.body.innerHTML = html;
  const range = document.createRange();
  range.selectNodeContents(document.querySelector(sel)!);
  return range;
}

describe('copy citations', () => {
  it('cites a Greek section as chapter.section', () => {
    const range = rangeOver('<span class="greek-line" id="L49a-3">λόγος</span>', '.greek-line');
    expect(greekCiteForRange(range, 'Ath. Pol.', ATHPOL)).toBe('(Ath. Pol. 49.3)');
    expect(greekCiteForRange(range, 'Ath. Pol.')).toBe('(Ath. Pol. 49a3)');
  });
  it('cites an English selection by chapter', () => {
    const range = rangeOver('<div class="segment" id="col-49a"><p>text</p></div>', 'p');
    expect(segCiteForRange(range, 'Ath. Pol.', ATHPOL)).toBe('(Ath. Pol. 49)');
  });
  it('keeps a Bekker work as it was', () => {
    const g = rangeOver('<span class="greek-line" id="L1094a-3">λόγος</span>', '.greek-line');
    expect(greekCiteForRange(g, 'NE', { citation: { scheme: 'bekker' } })).toBe('(NE 1094a3)');
    const e = rangeOver('<div class="segment" id="col-1097a"><p>text</p></div>', 'p');
    expect(segCiteForRange(e, 'NE', undefined)).toBe('(NE 1097a)');
  });
});
