// The chapter.section citation scheme (the Athenian Constitution): chapter N
// rides a synthetic column "Na", section S is line S. Every helper here must
// print "49.3" for that scheme and EXACTLY the old string for a Bekker work
// and the Isagoge's Busse pages, which the build compares byte for byte.
import { describe, expect, it } from 'vitest';
import {
  citeLabel, citeLabelOf, isChapterSection, isNonBekker, tickCite, type Segment,
} from '../lib/data';
import { measuresGreekTrack } from '../lib/greek-track';
import { positionsByChapter, positionsBySection } from '../lib/english-hit';
import { getWork } from '../lib/works';

const ATHPOL = { citation: { scheme: 'chapter-section' as const } };
const EN = getWork('EN')!;
const ISA = getWork('Isa')!;

describe('scheme flags', () => {
  it('reads chapter-section only off that scheme', () => {
    expect(isChapterSection(ATHPOL)).toBe(true);
    expect(isChapterSection(EN)).toBe(false);
    expect(isChapterSection(ISA)).toBe(false);
    expect(isChapterSection(undefined)).toBe(false);
  });
  it('counts Busse and chapter-section as non-Bekker, nothing else', () => {
    expect(isNonBekker(ATHPOL)).toBe(true);
    expect(isNonBekker(ISA)).toBe(true);
    expect(isNonBekker(EN)).toBe(false);
    expect(isNonBekker({})).toBe(false);
    expect(isNonBekker(null)).toBe(false);
  });
});

describe('citeLabel', () => {
  it('prints chapter.section for a chapter-section work', () => {
    expect(citeLabel(ATHPOL, '49a', '3')).toBe('49.3');
    expect(citeLabel(ATHPOL, '1a', '1')).toBe('1.1');
    expect(citeLabel(ATHPOL, '69a', '2')).toBe('69.2');
  });
  it('prints the bare chapter for a column with no line', () => {
    expect(citeLabel(ATHPOL, '49a')).toBe('49');
  });
  it('keeps the old string for a Bekker work', () => {
    expect(citeLabel(EN, '1094a', '5')).toBe('1094a5');
    expect(citeLabel(EN, '1094a')).toBe('1094a');
    expect(citeLabel(getWork('GA')!, '775a', '11a')).toBe('775a11a');
    expect(citeLabel(undefined, '1094a', '5')).toBe('1094a5');
  });
  it("keeps the Isagoge's current form", () => {
    expect(citeLabel(ISA, '1a', '5')).toBe('1a5');
    expect(citeLabel(ISA, '1a')).toBe('1a');
  });
});

describe('citeLabelOf', () => {
  it('reads a cite string the reader writes (hash, anchor cite)', () => {
    expect(citeLabelOf(ATHPOL, '49a3')).toBe('49.3');
    expect(citeLabelOf(ATHPOL, '49a')).toBe('49');
  });
  it('passes anything else through untouched', () => {
    expect(citeLabelOf(ATHPOL, 'ch-1-49')).toBe('ch-1-49');
    expect(citeLabelOf(EN, '1094a3')).toBe('1094a3');
    expect(citeLabelOf(EN, '1094a')).toBe('1094a');
    expect(citeLabelOf(ISA, '1a3')).toBe('1a3');
    expect(citeLabelOf(undefined, '775a11a')).toBe('775a11a');
  });
});

describe('tickCite', () => {
  it('cites an English section tick by its segment and number', () => {
    expect(tickCite('col-49a', '3')).toBe('49a3');
    expect(tickCite('col-49a', ' 12 ')).toBe('49a12');
  });
  it('refuses what is not a tick in a segment', () => {
    expect(tickCite('', '3')).toBeNull();
    expect(tickCite('ch-1-49', '3')).toBeNull();
    expect(tickCite('col-49a', '')).toBeNull();
    expect(tickCite('col-49a', '3a?')).toBeNull();
  });
});

describe('measuresGreekTrack', () => {
  it('measures every scheme but chapter-section', () => {
    expect(measuresGreekTrack(EN)).toBe(true);
    expect(measuresGreekTrack(ISA)).toBe(true);
    expect(measuresGreekTrack(undefined)).toBe(true);
    expect(measuresGreekTrack(ATHPOL)).toBe(false);
  });
});

describe('positionsBySection', () => {
  // Chapter 49 in one column: three sections, each opened by a real tick.
  const text = 'One alpha. Two alpha beta. Three alpha.';
  const seg: Segment = {
    id: 's49', column: '49a',
    greek: [1, 2, 3].map(n => ({ n, text: 'λόγος', tokens: [] })),
    english: {
      text, notes: [], markers: [],
      bekker: [
        { n: 1, offset: 0, real: true },
        { n: 2, offset: text.indexOf('Two'), real: true },
        { n: 3, offset: text.indexOf('Three'), real: true },
      ],
    },
  };
  const primary = { id: 'kenyon', slot: 'english' as const };

  it('splits one chapter\'s hits by the section each word stands in', () => {
    // words: One0 alpha1 Two2 alpha3 beta4 Three5 alpha6
    expect(positionsBySection(seg, primary, [1, 3, 4, 6])).toEqual([[1], [3, 4], [6]]);
  });
  it('agrees with the chapter split when a section holds every hit', () => {
    expect(positionsBySection(seg, primary, [3, 4])).toEqual([[3, 4]]);
    expect(positionsByChapter(seg, primary, [1, 3, 4, 6])).toEqual([[1, 3, 4, 6]]);
  });
  it('leaves positions that do not fit the text together', () => {
    expect(positionsBySection(seg, primary, [1, 99])).toEqual([[1, 99]]);
    expect(positionsBySection(seg, primary, [])).toEqual([[]]);
  });
});
