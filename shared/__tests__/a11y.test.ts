import axe from 'axe-core';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FootnotePopup from '../components/FootnotePopup.svelte';
import Reader from '../components/Reader.svelte';
import Search from '../components/Search.svelte';
import WordPopup from '../components/WordPopup.svelte';
import type { BookData } from '../lib/data';

const { fixtureBook } = vi.hoisted(() => ({
  fixtureBook: {
    book: 1,
    segments: [
      {
        id: 'seg1',
        column: '1094a',
        greek: [
          { n: 1, text: 'λόγος ἀρετή', tokens: [{ t: 'λόγος', o: 0, k: 'logos' }, { t: 'ἀρετή', o: 6, k: 'areth' }] },
        ],
        english: {
          text: 'Virtue [^1] and κόσμος are discussed here.',
          notes: [],
          markers: [],
          bekker: [{ n: 1, offset: 0, real: true }],
        },
        chapterStarts: [{ chapter: '1', beforeLine: 1, wordIndex: 0, engOffset: 0, bekker: '1094a' }],
        third: [
          {
            chapter: '1',
            cont: false,
            text: 'Ostwald says virtue [^1] beside κόσμος.',
            bekker: [{ n: 1, offset: 0, real: true }],
          },
        ],
      },
    ],
  } satisfies BookData,
}));

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => [
      {
        work: 'EN',
        meta: { id: 'seg1', book: 1, column: '1094a', greek_head: 'λόγος', greek_tokens: 'logos', english_head: 'Virtue and κόσμος' },
        grkMatch: true,
        engMatch: true,
        grkPositions: [0],
      },
    ]),
  };
});

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchBook: vi.fn(async () => fixtureBook),
    fetchChapters: vi.fn(async () => ({
      '1': [{ chapter: '1', column: '1094a', line: '1', bekker: '1094a' }],
    })),
    fetchFootnotes: vi.fn(async () => ({
      '1': '<p>Test footnote text.</p>',
    })),
    fetchLemmata: vi.fn(async () => ({
      logos: { slug: 'logos', head: 'λόγος', count: 2 },
    })),
    lookupWord: vi.fn(async () => ({
      analyses: [{ lemma: 'logos', gloss: 'word, account', parse: 'noun nominative singular', lsj: ['logos'] }],
      lsj: [{ key: 'logos', head: 'λόγος', html: '<p>word, speech, account</p>' }],
    })),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

async function expectNoSeriousAxeViolations(container: HTMLElement) {
  const results = await axe.run(container);
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious).toEqual([]);
}

describe('component accessibility', () => {
  it('WordPopup has no serious or critical axe violations', async () => {
    const { container } = render(WordPopup, {
      props: {
        work: 'EN',
        token: { t: 'λόγος', k: 'logos' },
        anchor: { x: 0, y: 0 },
        onClose: vi.fn(),
      },
    });

    await screen.findByText('word, account');
    await expectNoSeriousAxeViolations(container);
  });

  it('FootnotePopup has no serious or critical axe violations', async () => {
    const { container } = render(FootnotePopup, {
      props: {
        work: 'EN',
        n: '1',
        anchor: { x: 0, y: 0 },
        onClose: vi.fn(),
      },
    });

    await screen.findByText('Test footnote text.');
    await expectNoSeriousAxeViolations(container);
  });

  it('Search has no serious or critical axe violations', async () => {
    const { container } = render(Search);

    await expectNoSeriousAxeViolations(container);
  });

  it('Reader has no serious or critical axe violations', async () => {
    window.history.replaceState(null, '', '/EN/book/1');
    const { container } = render(Reader, { props: { work: 'EN', bookNum: 1, bookData: fixtureBook } });

    expect(await screen.findByText('1094a')).toBeInTheDocument();
    await expectNoSeriousAxeViolations(container);
  });
});
