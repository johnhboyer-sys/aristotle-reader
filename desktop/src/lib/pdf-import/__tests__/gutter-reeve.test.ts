import { describe, expect, it } from 'vitest';
import { splitPages } from '../pages';
import { createDocContext, scanPage, type PageScan } from '../gutter';
import {
  reeveThreePages,
  reevePage1Expected,
  reevePage2Expected,
  reevePage3Expected,
  type ExpectedReeveTic,
} from './fixtures/reeve-geometry';

// Same convention as the Lennox gold test: extract the token starting at
// `col` on `lines[lineIdx]`, punctuation-stripped, for comparison against
// the fixture's anchorWord.
function tokenAt(lines: string[], lineIdx: number, col: number): string {
  const line = lines[lineIdx] ?? '';
  const rest = line.slice(col);
  const word = rest.split(/\s+/)[0] ?? '';
  return word.replace(/[.,;:]+$/, '');
}

function expectTics(lines: string[], scan: PageScan, expected: ExpectedReeveTic[]) {
  expect(scan.tics).toHaveLength(expected.length);
  scan.tics.forEach((tic, i) => {
    const exp = expected[i];
    expect(tic.raw).toBe(exp.raw);
    expect(tic.column).toBe(exp.column);
    expect(tic.line).toBe(exp.line);
    expect(tokenAt(lines, tic.anchorLineIdx!, tic.anchorCol!)).toBe(exp.anchorWord);
  });
}

// Full-form (roll) tics carry an explicit a/b column letter in their raw text.
const isRollTic = (raw: string) => /[ab]/.test(raw);

describe('gutter Reeve-geometry synthetic fixture (recto/verso/recto)', () => {
  const pages = splitPages(reeveThreePages);
  const ctx = createDocContext();
  const scan1 = scanPage(pages[0], ctx);
  const scan2 = scanPage(pages[1], ctx);
  const scan3 = scanPage(pages[2], ctx);

  it('splits into exactly 3 physical pages', () => {
    expect(pages).toHaveLength(3);
  });

  it('page 1 (recto): binds all 5 tics with correct column/line/anchor', () => {
    expectTics(pages[0].lines, scan1, reevePage1Expected);
  });

  it('page 2 (verso): binds all 8 tics with correct column/line/anchor', () => {
    expectTics(pages[1].lines, scan2, reevePage2Expected);
  });

  it('page 3 (recto): binds all 7 tics with correct column/line/anchor, incl. hyphen-skip roll', () => {
    expectTics(pages[2].lines, scan3, reevePage3Expected);
  });

  it('sides, header line, and collapse status are correct on every page', () => {
    expect(scan1.side).toBe('recto');
    expect(scan2.side).toBe('verso');
    expect(scan3.side).toBe('recto');

    for (const scan of [scan1, scan2, scan3]) {
      expect(scan.headerLineIdx).toBe(0);
      expect(scan.collapsed).toBe(false);
    }
  });

  it('has zero dropped-line flags across all three pages', () => {
    const dropped = [...scan1.flags, ...scan2.flags, ...scan3.flags].filter((f) =>
      f.startsWith('dropped-line')
    );
    expect(dropped).toEqual([]);
  });

  it('never flags a roll (full-form) tic', () => {
    for (const scan of [scan1, scan2, scan3]) {
      for (const tic of scan.tics) {
        if (isRollTic(tic.raw)) {
          expect(tic.flags).toEqual([]);
        }
      }
    }
  });

  it('rejects the verso header range, the glued footnote decoy, and footnote/folio lines', () => {
    const allRaw = [...scan1.tics, ...scan2.tics, ...scan3.tics].map((t) => t.raw);
    // The header-trap range and its parts never surface as tics.
    expect(allRaw).not.toContain('1094a–1095a');
    expect(allRaw.some((r) => r.includes('–'))).toBe(false);
    // The glued ",1" footnote-marker decoy never surfaces as a tic.
    expect(allRaw).not.toContain('1');
    // The two folio numbers and the footnote-line numeral never surface.
    expect(allRaw).not.toContain('501');
    expect(allRaw).not.toContain('502');
    expect(allRaw).not.toContain('503');
  });

  it('carries the running Bekker address across all three physical pages', () => {
    expect(ctx.anyTicSeen).toBe(true);
    expect(ctx.lastTic).toEqual({ page: 1095, col: 'b', line: 1, physPage: 2 });
  });
});
