import { describe, expect, it } from 'vitest';
import { exportFinish, seedChoices } from '../choices';

describe('seedChoices', () => {
  it('unset settings seed english, original first, and the corpus layout block', () => {
    expect(seedChoices({}, 'corpus')).toEqual({
      mode: 'english',
      bilingualLayout: 'block',
      bilingualOrder: 'original-first',
      stampMode: undefined,
    });
  });

  it('unset layout seeds alternating for a document-spine work', () => {
    expect(seedChoices({}, 'document').bilingualLayout).toBe('alternating');
  });

  it('a configured setting wins', () => {
    const c = seedChoices(
      { mode: 'bilingual', bilingualLayout: 'table', bilingualOrder: 'translation-first', stampMode: 'every-line' },
      'document',
    );
    expect(c).toEqual({
      mode: 'bilingual',
      bilingualLayout: 'table',
      bilingualOrder: 'translation-first',
      stampMode: 'every-line',
    });
  });
});

describe('exportFinish', () => {
  it('a plain export says "Exported." and closes the window', () => {
    expect(exportFinish()).toEqual({ note: 'Exported.', close: true });
  });

  it('an export that ends with a note the user needs keeps the window open', () => {
    expect(exportFinish('Your reference document moved.')).toEqual({
      note: 'Exported. Your reference document moved.',
      close: false,
    });
  });
});
