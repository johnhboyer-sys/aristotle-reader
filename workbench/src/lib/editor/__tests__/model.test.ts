// ChapterModel helpers + dev-fixture sanity (the fixture is real pipeline
// data: Metaphysics Ζ.17, 1041a6–1041b33).
import { describe, expect, it } from 'vitest';
import { modelFromFixture, nextFootnoteId, displayNumbers, segmentCount, englishDocsOf } from '../model';
import type { RowModel } from '../model';
import { emptyRowDocJSON } from '../schema';
import { META_Z17 } from '../../../dev/fixture-meta-z17';

describe('META_Z17 fixture', () => {
  it('covers 1041a6–1041b33 (61 Greek lines), addresses in spine order', () => {
    expect(META_Z17.lines).toHaveLength(61);
    expect(META_Z17.lines[0].address).toEqual({ scheme: 'bekker-metaphysics', raw: '1041a6' });
    expect(META_Z17.lines.at(-1)!.address.raw).toBe('1041b33');
    expect(META_Z17.lines[0].greek.startsWith('Τί δὲ χρὴ λέγειν')).toBe(true);
    for (const line of META_Z17.lines) expect(line.greek.length).toBeGreaterThan(0);
  });

  it('builds a model with empty English rows and a clean slate', () => {
    const model = modelFromFixture(META_Z17);
    expect(model.rows).toHaveLength(61);
    expect(model.rows.every((r) => r.english.type === 'doc' && !r.english.content)).toBe(true);
    expect(model.footnotes).toEqual([]);
    expect(model.dirty).toBe(false);
    expect(model.bookLabel).toBe('Ζ');
    expect(model.chapter).toBe(17);
  });
});

describe('row segments (design doc D6)', () => {
  const base: RowModel = {
    address: { scheme: 'bekker-metaphysics', raw: '1041a6' },
    greek: 'Τί δὲ χρὴ λέγειν',
    english: emptyRowDocJSON(),
  };

  it('an unsplit row has exactly one segment — its english doc', () => {
    expect(segmentCount(base)).toBe(1);
    expect(englishDocsOf(base)).toEqual([base.english]);
  });

  it('a split row counts and enumerates segment 0 then its continuations, in order', () => {
    const seg1 = { type: 'doc' as const, content: [{ type: 'text' as const, text: 'two' }] };
    const seg2 = { type: 'doc' as const, content: [{ type: 'text' as const, text: 'three' }] };
    const row: RowModel = { ...base, splitOffsets: [3, 6], english2: [seg1, seg2] };
    expect(segmentCount(row)).toBe(3);
    expect(englishDocsOf(row)).toEqual([base.english, seg1, seg2]);
  });

  it('an empty english2 array behaves as unsplit', () => {
    const row: RowModel = { ...base, english2: [] };
    expect(segmentCount(row)).toBe(1);
    expect(englishDocsOf(row)).toEqual([base.english]);
  });
});

describe('footnote id + display numbers', () => {
  it('nextFootnoteId is max numeric id + 1 (stable ids)', () => {
    expect(nextFootnoteId([])).toBe('1');
    expect(
      nextFootnoteId([
        { id: '1', body: '', anchored: true },
        { id: '3', body: '', anchored: false },
      ]),
    ).toBe('4');
  });

  it('displayNumbers follows marker document order, not id order', () => {
    const map = displayNumbers(['3', '1', '2']);
    expect(map.get('3')).toBe(1);
    expect(map.get('1')).toBe(2);
    expect(map.get('2')).toBe(3);
    expect(map.get('9')).toBeUndefined();
  });
});
