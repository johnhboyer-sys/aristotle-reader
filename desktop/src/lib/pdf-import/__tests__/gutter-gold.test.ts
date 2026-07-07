import { describe, expect, it } from 'vitest';
import { splitPages } from '../pages';
import { scanPage } from '../gutter';
import {
  lennox675bExpected,
  lennox675bPage,
  lennox675bPrimerContext,
} from './fixtures/lennox-675b';

// Extract the token starting at `col` on `page.lines[lineIdx]`, stripping
// trailing punctuation, for comparison against the fixture's anchorWord.
function tokenAt(page: ReturnType<typeof splitPages>[number], lineIdx: number, col: number): string {
  const line = page.lines[lineIdx] ?? '';
  const rest = line.slice(col);
  const word = rest.split(/\s+/)[0] ?? '';
  return word.replace(/[.,;:]+$/, '');
}

describe('gutter gold fixtures (Lennox PA 675b)', () => {
  const page = splitPages(lennox675bPage)[0];

  it('detects exactly 8 tics, in order, with correct column/line/anchor', () => {
    const scan = scanPage(page, lennox675bPrimerContext());
    expect(scan.tics).toHaveLength(8);

    scan.tics.forEach((tic, i) => {
      const expected = lennox675bExpected[i];
      expect(tic.raw).toBe(expected.raw);
      expect(tic.column).toBe(expected.column);
      expect(tic.line).toBe(expected.line);
      expect(tokenAt(page, tic.anchorLineIdx!, tic.anchorCol!)).toBe(expected.anchorWord);
    });
  });

  it('is not collapsed and finds the header on the first line', () => {
    const scan = scanPage(page, lennox675bPrimerContext());
    expect(scan.collapsed).toBe(false);
    expect(scan.headerLineIdx).toBe(0);
    // The Clarendon header trap: line 0 carries the page's opening Bekker
    // page ("675b") at the gutter column itself. It must never become a tic
    // — stripped positionally, and arithmetically unable to pass the
    // cadence guard (a header full-form implies line 1).
    expect(scan.tics.some((t) => t.lineIdx === 0)).toBe(false);
  });
});
