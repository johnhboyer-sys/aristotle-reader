import { describe, expect, it } from 'vitest';
import { slicePages } from '../slice';
import type { CorpusConfig } from '../corpus-config';

function config(slice?: CorpusConfig['slice']): CorpusConfig {
  return {
    id: 'synthetic-corpus',
    workTitle: 'Synthetic Work',
    runningHeadPlaceholder: '[head]',
    bekkerStart: { page: 1, col: 'a' },
    bekkerEnd: { page: 2, col: 'b' },
    divisions: { books: 1, chaptersPerBook: [2] },
    backbonePath: 'backbone.txt',
    witnessPath: 'witness.txt',
    outDir: 'out',
    slice,
  };
}

describe('slicePages', () => {
  const pages = [
    'Title Page\r\nSynthetic title',
    'Preface\r\nCOMMENTARY appears here before the body',
    'Header\r\n   BOOK ONE   \r\nBody opening with  spaces  ',
    'Header\r\nSecond body page\r\nPreserve trailing spaces   ',
    'COMMENTARY\r\nBack matter begins',
    'Notes\r\nIndex-like notes',
  ];
  const raw = pages.join('\f');

  it('selects p0/p1 correctly, preserves kept page bytes, and records both cuts', () => {
    const outcome = slicePages(
      raw,
      config({ bodyStart: '^\\s*BOOK ONE\\s*$', backMatterStart: '^COMMENTARY$' })
    );

    expect(outcome.text).toBe([pages[2], pages[3]].join('\f'));
    expect(outcome.frontMatter).toBe([pages[0], pages[1]].join('\f'));
    expect(outcome.backMatter).toBe([pages[4], pages[5]].join('\f'));
    expect(outcome.changes).toHaveLength(2);
    expect(outcome.changes[0]).toMatchObject({
      stage: 1,
      tier: 1,
      rule: 'slice',
      page: 0,
      evidence: {
        kind: 'front-matter',
        pages: '0-1',
        matched: 'BOOK ONE',
      },
    });
    expect(outcome.changes[1]).toMatchObject({
      stage: 1,
      tier: 1,
      rule: 'slice',
      page: 4,
      evidence: {
        kind: 'back-matter',
        pages: '4-5',
        matched: 'COMMENTARY',
      },
    });
  });

  it('matches backMatterStart only after p0', () => {
    const outcome = slicePages(
      raw,
      config({ bodyStart: '^\\s*BOOK ONE\\s*$', backMatterStart: '^COMMENTARY' })
    );

    expect(outcome.text).toBe([pages[2], pages[3]].join('\f'));
    expect(outcome.changes[1].page).toBe(4);
    expect(outcome.changes[1].evidence).toMatchObject({ pages: '4-5' });
  });

  it('passes through unchanged when config has no slice', () => {
    const outcome = slicePages(raw, config());

    expect(outcome).toEqual({ text: raw, changes: [], frontMatter: '', backMatter: '' });
  });

  it('throws with the bodyStart pattern when bodyStart never matches', () => {
    expect(() => slicePages(raw, config({ bodyStart: '^BOOK TWO$' }))).toThrow(
      /synthetic-corpus.*\^BOOK TWO\$/u
    );
  });

  it('throws with the backMatterStart pattern when provided but never matching after p0', () => {
    expect(() =>
      slicePages(raw, config({ bodyStart: '^\\s*BOOK ONE\\s*$', backMatterStart: '^APPENDIX$' }))
    ).toThrow(/synthetic-corpus.*\^APPENDIX\$/u);
  });

  it('keeps to the end and records one front cut when backMatterStart is absent', () => {
    const outcome = slicePages(raw, config({ bodyStart: '^\\s*BOOK ONE\\s*$' }));

    expect(outcome.text).toBe(pages.slice(2).join('\f'));
    expect(outcome.backMatter).toBe('');
    expect(outcome.frontMatter).toBe([pages[0], pages[1]].join('\f'));
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      rule: 'slice',
      tier: 1,
      stage: 1,
      page: 0,
      evidence: { kind: 'front-matter', pages: '0-1', matched: 'BOOK ONE' },
    });
  });

  it('records only a back cut when p0 is 0', () => {
    const startPages = [
      'BOOK ONE\r\nBody starts immediately',
      'Still body',
      'COMMENTARY\r\nBack matter',
    ];
    const outcome = slicePages(
      startPages.join('\f'),
      config({ bodyStart: '^BOOK ONE$', backMatterStart: '^COMMENTARY$' })
    );

    expect(outcome.text).toBe([startPages[0], startPages[1]].join('\f'));
    expect(outcome.frontMatter).toBe('');
    expect(outcome.backMatter).toBe(startPages[2]);
    expect(outcome.changes).toHaveLength(1);
    expect(outcome.changes[0]).toMatchObject({
      rule: 'slice',
      tier: 1,
      stage: 1,
      page: 2,
      evidence: { kind: 'back-matter', pages: '2-2', matched: 'COMMENTARY' },
    });
  });
});
