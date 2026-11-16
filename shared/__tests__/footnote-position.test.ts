import { describe, expect, it } from 'vitest';
import { footnotePosition, footnoteInteraction } from '../lib/footnote-position';

const viewport = { width: 1000, height: 800 };
const popup = { width: 380, height: 200 };
const marker = { left: 100, right: 115, top: 300, bottom: 315 };

describe('footnotePosition', () => {
  it('follows the marker below its bottom edge', () => {
    expect(footnotePosition(marker, viewport, popup)).toEqual({ left: '100px', top: '323px' });
    expect(footnotePosition({ ...marker, top: 200, bottom: 215 }, viewport, popup))
      .toEqual({ left: '100px', top: '223px' });
  });
  it('clamps at the right and bottom edges, including after a resize', () => {
    expect(footnotePosition({ left: 980, right: 995, top: 780, bottom: 795 }, viewport, popup))
      .toEqual({ left: '604px', top: '584px' });
    expect(footnotePosition(marker, { width: 400, height: 400 }, popup))
      .toEqual({ left: '8px', top: '184px' });
  });
  it.each([
    { top: -15, bottom: 0 }, { top: 800, bottom: 815 },
    { left: -15, right: 0 }, { left: 1000, right: 1015 },
  ])('closes when fully outside an edge: %o', edge => {
    expect(footnotePosition({ ...marker, ...edge }, viewport, popup)).toBeNull();
  });
  it('keeps partially visible markers open and clamps the popup at the top', () => {
    expect(footnotePosition({ ...marker, top: -14, bottom: 1 }, viewport, popup)).not.toBeNull();
    expect(footnotePosition(marker, viewport, { ...popup, height: 900 }))
      .toEqual({ left: '100px', top: '8px' });
  });
});

describe('footnoteInteraction', () => {
  it('closes a hover note on scroll', () => {
    expect(footnoteInteraction('hover', 'scroll')).toBe('closed');
  });
  it('lets explicitly opened notes follow on scroll', () => {
    expect(footnoteInteraction('opened', 'scroll')).toBe('opened');
  });
  it('promotes a hover note on activation before the next scroll', () => {
    expect(footnoteInteraction(footnoteInteraction('hover', 'activate'), 'scroll')).toBe('opened');
  });
  it('does not reopen a note closed by scroll', () => {
    expect(footnoteInteraction('closed', 'activate')).toBe('closed');
  });
});
