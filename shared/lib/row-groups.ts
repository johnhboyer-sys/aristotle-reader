import type { Segment } from './data';
import type { TranslationRef } from './works';

export interface ColumnRow {
  segmentIndex: number;
  blockIndex: number;
  column: string;
  chapter: string;
  chapterStart: boolean;
}
export type RowGroup = ColumnRow[];
type Translation = Pick<TranslationRef, 'id' | 'slot'>;

/** Group chapter rows across adjacent columns when every shown text continues.
 * Translation slots resolve work-specific ids to the emitted fields. */
export function rowGroups(segments: Segment[], shownIds: string[], translations: Translation[] = [
  { id: 'english', slot: 'english' }, { id: 'ross', slot: 'secondary' }, { id: 'third', slot: 'third' },
]): RowGroup[] {
  const groups: RowGroup[] = [];
  let chapter = '';
  for (const [segmentIndex, seg] of segments.entries()) {
    const starts = [...(seg.chapterStarts ?? [])].sort((a, b) =>
      a.beforeLine - b.beforeLine || a.wordIndex - b.wordIndex);
    const first = starts[0];
    const continuation = !first || first.engOffset > 0 || first.wordIndex > 0 ||
      seg.greek.some(l => l.n < first.beforeLine);
    const rows = [...(continuation ? [null] : []), ...starts];
    for (const [blockIndex, start] of rows.entries()) {
      if (start) chapter = start.chapter;
      const row: ColumnRow = { segmentIndex, blockIndex, column: seg.column, chapter, chapterStart: !!start };
      const breaks = shownIds.some(id => {
        const slot = translations.find(t => t.id === id)?.slot;
        if (slot === 'english') return seg.english?.paraStart === true;
        const pieces = slot === 'secondary' ? (seg.secondary ?? seg.ross) :
          slot === 'third' ? seg.third : seg.overlays?.[id];
        return pieces?.find(p => p.chapter === chapter)?.para === true;
      });
      const prevGroup = groups.at(-1);
      const prev = prevGroup?.at(-1);
      if (prev && !start && !breaks && prev.segmentIndex === segmentIndex - 1 &&
          prev.chapter === chapter && nextColumn(prev.column) === seg.column) {
        prevGroup!.push(row);
      } else groups.push([row]);
    }
  }
  return groups;
}

function nextColumn(column: string): string {
  const m = /^(\d+)([ab])$/.exec(column);
  return m ? (m[2] === 'a' ? `${m[1]}b` : `${Number(m[1]) + 1}a`) : '';
}
