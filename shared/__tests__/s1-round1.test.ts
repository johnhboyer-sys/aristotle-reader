import { render, screen, fireEvent } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import WordPopup from '../components/WordPopup.svelte';
import { paginate } from '../lib/search-pages';
import type { SearchResult } from '../lib/search';
vi.mock('../lib/search', async original => ({ ...await original<typeof import('../lib/search')>(),
 search: vi.fn(async () => ({ results: [], failedWorks: [] })),
 searchCombo: vi.fn(async () => ({ results: [], failedWorks: [], approximateChapters: ['EN'] })),
 speakerRoster: vi.fn(async () => []),
 loadOffsets: vi.fn(async () => { throw new Error('no offsets'); }),
}));
vi.mock('../lib/data', async original => ({ ...await original<typeof import('../lib/data')>(),
 fetchBook: vi.fn(async () => ({ book: 1, segments: [{ id: '1:1094a', column: '1094a',
 greek: [1, 18, 20].map(n => ({ n, text: n === 1 ? 'ἀρχή' : n === 18 ? 'ἀρετή' : 'τέλος', tokens: [{ t: n === 1 ? 'ἀρχή' : n === 18 ? 'ἀρετή' : 'τέλος', k: 'logos', o: 0 }] })),
 english: { text: 'Start of book. Now virtue appears.', notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }, { n: 18, offset: 19, real: true }] },
 chapterStarts: [{ chapter: '2', beforeLine: 18, engOffset: 19 }],
 }] })),
 fetchChapters: vi.fn(async () => ({ '1': [{ column: '1094a', chapter: '1', line: '1' }, { column: '1094a', chapter: '2', line: '18' }] })),
 fetchLemmata: vi.fn(async () => ({ logos: { slug: 'logos', head: 'λόγος', count: 10, distinctiveness_label: 'rare before Aristotle' } })),
 fetchLsjHeads: vi.fn(async () => ({})),
 lookupWord: vi.fn(async () => ({ analyses: [{ lemma: 'logos', gloss: 'word', parse: 'noun nom sg', lsj: ['logos'] }], lsj: [] })),
}));
afterEach(() => { vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });
it('sizes chapter pages by phrase windows, including when offsets fail', () => {
 const results = [1,2,3].map(book => ({ work: 'EN', meta: { id: `${book}:1094a`, book, column: '1094a' }, grkMatch: true, engMatch: false, grkPositions: [0,1,2,3], windows: [[0,1,2,3]] } as SearchResult));
 expect(paginate(results, new Map(), 3).pages).toEqual([results]);
});
it('shows cx=0 as a chapter control and removable chosen filter', async () => {
 window.history.replaceState(null, '', '/search?c=f:logos&c=f:logos&cx=0');
 render(Search);
 // The editor is shut on a proximity search from the address; Change opens it (S3).
 await fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
 const checkbox = await screen.findByRole('checkbox', { name: 'Keep hits that cross a chapter' });
 expect(checkbox).not.toBeChecked();
 await fireEvent.click(await screen.findByRole('button', { name: 'Remove Within a chapter' }));
 expect(checkbox).toBeChecked();
});
it('reports approximate chapter starts', async () => {
 window.history.replaceState(null, '', '/search?c=f:logos&c=f:logos'); render(Search);
 expect(await screen.findByText(/are recorded to the Bekker line, not the word/)).toHaveTextContent('Chapter starts in Nicomachean Ethics');
});
it('ignores speaker parameters and never opens their panel', async () => {
 window.history.replaceState(null, '', '/search?g=logos&sp=only&sn=Socrates');
 const { container } = render(Search);
 const { search } = await import('../lib/search');
 await vi.waitFor(() => expect(search).toHaveBeenCalled());
 expect(vi.mocked(search).mock.calls[0][8]).toBeUndefined();
 expect(container.querySelector('#speaker-panel')).toBeNull();
});
it.each([true, false])('shows distinctiveness once with the right markup (b=%s)', async b => {
 const { container } = render(WordPopup, { props: { token: { t: 'λόγος', k: 'logos' }, b, onClose() {} } });
 await screen.findByText('rare before Aristotle');
 expect(screen.getAllByText('rare before Aristotle')).toHaveLength(1);
 if (!b) expect(container.querySelector('em.distinct-label')).toHaveTextContent('rare before Aristotle');
});
it('places a Bekker English hit in its chapter and exports the Aristotle CSV columns', async () => {
 const { search } = await import('../lib/search');
 vi.mocked(search).mockResolvedValueOnce({ results: [{ work: 'EN', meta: { id: '1:1094a', book: 1, column: '1094a' }, grkMatch: false, engMatch: true, grkPositions: [], engHits: [{ translation: 'rackham', positions: [4] }] }], failedWorks: [] });
 window.history.replaceState(null, '', '/search?e=virtue');
 const { container } = render(Search);
 await vi.waitFor(() => expect(container.querySelector('li.instance')).not.toBeNull());
 const group = container.querySelector('.chapter-group')!;
 expect(group.querySelector('a[href*="loc=1094a:18"]')).not.toBeNull();
 expect(group.querySelector('.inst-pair[lang="grc"]')).toHaveTextContent('ἀρετή τέλος');
 expect(group.querySelectorAll('.inst-pair[lang="grc"] button.gw')).toHaveLength(3);
 let csv: Blob | undefined;
 URL.createObjectURL = vi.fn(blob => { csv = blob; return 'blob:test'; });
 URL.revokeObjectURL = vi.fn();
 vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
 await fireEvent.click(screen.getByRole('button', { name: 'Export results as CSV' }));
 await vi.waitFor(() => expect(csv).toBeDefined());
 const content = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(csv!); });
 const [header, row] = content.replace(/^\uFEFF/, '').split('\r\n');
 expect(header).toBe('Work,Book,Chapter,Bekker,Language,Translation,Snippet,URL');
 expect(row).toMatch(/^Nicomachean Ethics,I,2,1094a18,English,Rackham,.*virtue.*,http.*loc=1094a:18/);
});
it('counts an AthPol English phrase once in its row and header', async () => {
 const { search } = await import('../lib/search');
 const { fetchBook, fetchChapters } = await import('../lib/data');
 const book = await fetchBook('AthPol', 1);
 book.segments[0].id = '1:1';
 book.segments[0].column = '1';
 book.segments[0].chapterStarts = [];
 vi.mocked(fetchBook).mockResolvedValueOnce(book);
 vi.mocked(fetchChapters).mockResolvedValueOnce({ '1': [{ column: '1', chapter: '1', line: '1', bekker: '1a1–1' }] });
 vi.mocked(search).mockResolvedValueOnce({ results: [{ work: 'AthPol', meta: { id: '1:1', book: 1, column: '1' }, grkMatch: false, engMatch: true, grkPositions: [], engHits: [{ translation: 'rackham', positions: [4, 5], matches: [4] }] }], failedWorks: [] });
 window.history.replaceState(null, '', '/search?e=virtue%20appears&em=phrase');
 const { container } = render(Search);
 await vi.waitFor(() => expect(container.querySelector('li.instance')).not.toBeNull());
 expect(container.querySelector('.result-count')).toHaveTextContent('1 instance');
 expect(container.querySelector('.group-count')).toHaveTextContent(/^1 instance$/);
 expect(container.querySelectorAll('li.instance mark')).toHaveLength(2);
});

it('keeps cx chip tied to the submitted search', async () => {
 window.history.replaceState(null, '', '/search?c=f:logos&c=f:logos');
 render(Search);
 await fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
 const box = await screen.findByRole('checkbox', { name: 'Keep hits that cross a chapter' });
 await fireEvent.click(box);
 expect(screen.queryByRole('button', { name: 'Remove Within a chapter' })).toBeNull();
});
it('keeps cx removal filters and submitted slots', async () => {
 const { searchCombo } = await import('../lib/search');
 window.history.replaceState(null, '', '/search?c=f:logos&c=f:logos&cx=0&w=EN,Pol&wf=EN&ctx=1');
 render(Search);
 await screen.findByRole('button', { name: 'Remove Within a chapter' });
 await fireEvent.click(screen.getByRole('button', { name: 'Remove Within a chapter' }));
 await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(2));
 expect(new URLSearchParams(location.search).get('w')).toBe('EN,Pol');
 expect(location.search).toContain('ctx=1');
 expect(location.search).not.toContain('cx=0');
});
it('puts the approximate chapter notice in three cells', async () => {
 window.history.replaceState(null, '', '/search?c=f:logos&c=f:logos'); render(Search);
 const text = await screen.findByText(/are recorded to the Bekker line, not the word/);
 expect(text.parentElement?.children).toHaveLength(3);
});
