import { describe, expect, it } from 'vitest';
import { buildOutline } from '../outline';
import { buildRowDoc, type InlineRun } from '../serialize';
import { emptyRowDocJSON } from '../schema';
import type { RowModel } from '../model';

const t = (text: string): InlineRun => ({ kind: 'text', text, marks: {} });
const row = (greek: string, opts: Partial<RowModel> = {}): RowModel => ({
  address: { scheme: 'plain-line', raw: '1' },
  greek,
  english: emptyRowDocJSON(),
  ...opts,
});

describe('buildOutline', () => {
  it('includes only role rows, in order, labeled by their translation', () => {
    const rows = [
      row('Articulus 1', { role: 'header', english: buildRowDoc([t('Article 1')]).toJSON() }),
      row('Ad primum sic proceditur'),
      row('Utrum Deus sit', { role: 'subheader', english: buildRowDoc([t('Whether God exists')]).toJSON() }),
    ];
    expect(buildOutline(rows)).toEqual([
      { rowIndex: 0, level: 1, label: 'Article 1' },
      { rowIndex: 2, level: 2, label: 'Whether God exists' },
    ]);
  });

  it('falls back to the original text when the heading is untranslated', () => {
    const rows = [row('Articulus 1', { role: 'header' })];
    expect(buildOutline(rows)).toEqual([{ rowIndex: 0, level: 1, label: 'Articulus 1' }]);
  });

  it('returns [] when no row carries a role', () => {
    expect(buildOutline([row('plain'), row('text')])).toEqual([]);
  });
});
