import { describe, expect, it } from 'vitest';
import { rowGroups } from '../lib/row-groups';
import type { Segment } from '../lib/data';

const start = (chapter: string, beforeLine = 1, engOffset = 0) => ({ chapter, beforeLine, engOffset, wordIndex: 0, bekker: '' });
function book(): Segment[] {
  return ['1094a', '1094b', '1095a'].map((column, i) => ({
    id: column, column, greek: [{ n: 1, text: 'λόγος', tokens: [] }],
    english: { text: 'some prose', notes: [], markers: [] },
    chapterStarts: i === 0 ? [start('1')] : [],
    ross: [{ chapter: '1', text: 'other prose', cont: i > 0 }],
  }));
}
const sizes = (segments: Segment[], shown = ['english']) => rowGroups(segments, shown).map(g => g.length);

describe('rowGroups', () => {
  it('joins two and three columns without paragraph flags', () => {
    expect(sizes(book().slice(0, 2))).toEqual([2]);
    expect(sizes(book())).toEqual([3]);
  });
  it('stops at a chapter opening at column start', () => {
    const segments = book();
    segments[1].chapterStarts = [start('2')];
    expect(sizes(segments)).toEqual([1, 2]);
  });
  it('joins the tail before a mid-column chapter, then joins its next column', () => {
    const segments = book();
    segments[1].chapterStarts = [start('2', 2, 4)];
    const groups = rowGroups(segments, ['english']);
    expect(groups.map(g => g.map(r => [r.column, r.chapter]))).toEqual([
      [['1094a', '1'], ['1094b', '1']], [['1094b', '2'], ['1095a', '2']],
    ]);
  });
  it('stops at a primary paragraph start only when primary is shown', () => {
    const segments = book();
    segments[1].english!.paraStart = true;
    expect(sizes(segments)).toEqual([1, 2]);
    expect(sizes(segments, ['ross'])).toEqual([3]);
  });
  it('stops at overlay paragraph starts only when that overlay is shown', () => {
    const segments = book();
    segments[1].ross![0].para = true;
    expect(sizes(segments, ['ross'])).toEqual([1, 2]);
    expect(sizes(segments)).toEqual([3]);
  });
  it('Compare joins only when both shown translations continue', () => {
    const segments = book();
    expect(sizes(segments, ['english', 'ross'])).toEqual([3]);
    segments[1].ross![0].para = true;
    segments[2].english!.paraStart = true;
    expect(sizes(segments, ['english', 'ross'])).toEqual([1, 1, 1]);
  });
  it('resolves work-specific ids, third and extra overlays', () => {
    const segments = book();
    segments[1].third = [{ chapter: '1', text: 'third', cont: true, para: true }];
    segments[2].overlays = { extra: [{ chapter: '1', text: 'extra', cont: true, para: true }] };
    expect(rowGroups(segments, ['primary', 'extra'], [
      { id: 'primary', slot: 'english' }, { id: 'extra', slot: 'overlay' },
    ]).map(g => g.length)).toEqual([2, 1]);
    expect(sizes(segments, ['third'])).toEqual([1, 2]);
  });
  it('does not join gaps in Bekker columns or change its input', () => {
    const segments = book().filter((_, i) => i !== 1);
    const before = JSON.stringify(segments);
    expect(sizes(segments)).toEqual([1, 1]);
    expect(JSON.stringify(segments)).toBe(before);
  });
});
