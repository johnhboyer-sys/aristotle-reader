import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import Search from '../components/Search.svelte';
import { search, lemmaOptions } from '../lib/search';
import { fetchLemmaPickerShard } from '../lib/data';

const { book, results } = vi.hoisted(() => ({
  book: { book: 1, segments: [{
    id: 'seg', column: '1094a',
    greek: [{ n: 1, text: 'ἀρετή ἀρετή', tokens: [{ t: 'ἀρετή', o: 0, k: 'areth' }, { t: 'ἀρετή', o: 6, k: 'areth' }] }],
    english: { text: 'Virtue is discussed here.', notes: [], markers: [], bekker: [{ n: 1, offset: 0, real: true }] },
  }] },
  results: ['EN', 'Cat'].map(work => ({ work, meta: { id: 'seg', book: 1, column: '1094a' }, grkMatch: true, engMatch: false, grkPositions: work === 'EN' ? [0, 1] : [0] })),
}));
vi.mock('../lib/search', async original => ({
  ...await original<typeof import('../lib/search')>(),
  lemmaOptions: vi.fn(async (folds: string[]) => folds.map(fold => [fold])),
  search: vi.fn(async () => ({ results, failedWorks: [] })),
  loadOffsets: vi.fn(async () => null),
}));
vi.mock('../lib/data', async original => ({
  ...await original<typeof import('../lib/data')>(),
  fetchBook: vi.fn(async () => book),
  fetchChapters: vi.fn(async () => ({ '1': [{ chapter: '5', column: '1094a', line: '1', bekker: '1094a' }] })),
  fetchLemmaPickerShard: vi.fn(async () => ({ areth: { n: 3, c: [{ h: 'ἀρετή', k: 'a)reth/', s: 'arete' }] } })),
  fetchLemmaGlosses: vi.fn(async () => ['excellence']),
}));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
async function run() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ '1': { '5': 'Virtue[^1]' } }))));
  const view = render(Search, { props: { b: true } });
  await fireEvent.input(screen.getByRole('searchbox', { name: 'Search Greek' }), { target: { value: 'ἀρετή' } });
  await fireEvent.submit(view.container.querySelector('form')!);
  await waitFor(() => expect(view.container.querySelector('main')?.dataset.searchBusy).toBe('false'));
  return view;
}
it('keeps each language query while submitting only the selected languages', async () => {
  const { container } = await run();
  await fireEvent.click(screen.getByRole('button', {name: 'English'}));
  expect((screen.getByRole('searchbox', {name: 'Search English'}) as HTMLInputElement).value).toBe('');
  await fireEvent.input(screen.getByRole('searchbox', {name: 'Search English'}), {target: {value: 'virtue'}});
  await fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(vi.mocked(search).mock.lastCall?.slice(0,2)).toEqual(['', 'virtue']));
  await fireEvent.click(screen.getByRole('button', {name: 'Both'}));
  expect((screen.getByRole('searchbox', {name: 'Search Greek'}) as HTMLInputElement).value).toBe('ἀρετή');
  expect((screen.getByRole('searchbox', {name: 'Search English'}) as HTMLInputElement).value).toBe('virtue');
  await waitFor(() => expect(vi.mocked(search).mock.lastCall?.slice(0,2)).toEqual(['ἀρετή','virtue']));
  await fireEvent.click(screen.getByRole('button', {name: 'Greek'}));
  await waitFor(() => expect(vi.mocked(search).mock.lastCall?.slice(0,2)).toEqual(['ἀρετή','']));
  await fireEvent.click(screen.getByRole('button', {name: 'English'}));
  expect((screen.getByRole('searchbox', {name: 'Search English'}) as HTMLInputElement).value).toBe('virtue');
});
it('filters live hits, retains reader links, and does not repeat the English context', async () => {
  const { container } = await run();
  expect(container.querySelector('.b-sr-big')?.textContent).toBe('3');
  expect(container.querySelector('.b-sg.closed')?.getAttribute('data-result-work')).toBe('EN');
  await fireEvent.click(container.querySelector('[data-result-work=Cat] h2 button')!);
  await fireEvent.click(container.querySelector('[data-result-work=EN] h2 button')!);
  await fireEvent.click(container.querySelector('[data-result-work=EN] h3 button')!);
  expect([...container.querySelectorAll('.b-hr')].map(el => el.textContent)).toEqual(['I.5 1094a1', 'I.5 1094a1']);
  expect(container.querySelector('.b-hr')?.getAttribute('href')).toContain('/EN/book/1?');
  expect(container.querySelectorAll('.b-hg .tok.hit')).toHaveLength(2);
  expect(container.querySelectorAll('.b-he')).toHaveLength(1);
  expect(container.querySelector('.b-he span a')?.textContent).toBe('Rackham');
  expect(container.querySelector('.b-he span a')?.getAttribute('href')).toContain('trans=rackham');
  expect(container.querySelector('.b-sch h3')?.textContent).toContain('Virtue');
  expect(container.querySelector('.b-sch h3')?.textContent).not.toContain('[^1]');
  expect(container.querySelector('.b-sg.closed')?.getAttribute('data-result-work')).toBe('Cat');
  await fireEvent.click(container.querySelector('[data-work-filter="Cat"]')!);
  await waitFor(() => expect(container.querySelector('main')?.dataset.searchBusy).toBe('false'));
  expect(container.querySelectorAll('.b-sg')).toHaveLength(1);
  expect(container.querySelector('.b-sg')?.getAttribute('data-result-work')).toBe('Cat');
  expect(container.querySelector('.b-sr-big')?.textContent).toBe('1');
});
it('uses a known live lemma and gloss, and drops a summary that no longer holds', async () => {
  const { container } = await run();
  await waitFor(() => expect(container.querySelector('.b-sr-t')?.textContent).toContain('excellence'));
  expect(screen.getByRole('link', { name: 'Lexicon' }).getAttribute('href')).toBe('/lemma/arete/');
  expect(container.querySelector('.b-sq-o')?.textContent).toContain('any form · accents ignored · all works');
  await fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  await fireEvent.click(screen.getByRole('checkbox', { name: 'Match accents exactly' }));
  expect(container.querySelector('.b-sq-o')?.textContent).not.toContain('any form · accents ignored · all works');
});
it('disables combining queries until both language fields contain text', async () => {
  const { container } = await run();
  await fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  const group = container.querySelector<HTMLFieldSetElement>('.op-group')!;
  expect(group.disabled).toBe(true);
  await fireEvent.click(screen.getByRole('button', { name: 'Both' }));
  await fireEvent.input(screen.getByRole('searchbox', { name: 'Search English' }), {target: {value: 'virtue'}});
  expect(group.disabled).toBe(false);
  await fireEvent.input(screen.getByRole('searchbox', { name: 'Search English' }), {target: {value: ''}});
  expect(group.disabled).toBe(true);
});
it('keeps lemma picks and combo text when the language changes', async () => {
  const {container} = await run();
  await fireEvent.click(screen.getByRole('button', {name: 'More options'}));
  await fireEvent.click(container.querySelector('.advanced-trigger')!);
  await fireEvent.click(container.querySelector('.lemma-panel summary')!);
  await fireEvent.input(container.querySelector('.lemma-panel input[type=search]')!, {target: {value: 'areth'}});
  await waitFor(() => expect(container.querySelector('.lemma-candidate input')).not.toBeNull());
  await fireEvent.click(container.querySelector('.lemma-candidate input')!);
  await fireEvent.click(container.querySelector('.combo-panel summary')!);
  await fireEvent.input(container.querySelector('.combo-slot:nth-child(2) input')!, {target: {value: 'logos'}});
  await fireEvent.click(screen.getByRole('button', {name: 'English'}));
  await fireEvent.click(screen.getByRole('button', {name: 'Greek'}));
  expect(container.querySelector('.lemma-chip')?.textContent).toContain('areth');
  expect(container.querySelector<HTMLInputElement>('.combo-slot:nth-child(2) input')?.value).toBe('logos');
});
it('keeps English Bekker refs at column level and links the translator to its place', async () => {
  vi.mocked(search).mockResolvedValueOnce({results: [{...results[0], grkMatch: false, engMatch: true, engHits: [{translation: 'rackham', positions: [0]}]}], failedWorks: []});
  const {container} = await run();
  expect(container.querySelector('.b-hr')?.textContent).toBe('I.5 1094a');
  expect(container.querySelector('.b-he span a')?.getAttribute('href')).toContain('trans=rackham');
  expect(container.querySelector('.b-sg h2 span')?.textContent).toBe('1 place');
  expect(container.querySelector('.b-sr-t')?.textContent).toContain('place in 1 work for ἀρετή');
});

it('omits a gloss when the lemma resolver gives more than one reading', async () => {
  vi.mocked(lemmaOptions).mockResolvedValueOnce([['aretaw','other']]);
  const {container} = await run();
  expect(container.querySelector('.b-sr-t')?.textContent).not.toContain('excellence');
  expect(container.querySelector('.b-sr-t')?.textContent).toContain('for ἀρετή');
});
it('omits a surface-search gloss when the picker candidate is not the headword own form', async () => {
  const {container} = await run();
  await fireEvent.click(screen.getByRole('button', {name: 'More options'}));
  await fireEvent.click(container.querySelector('input[name=matchmode][value=form]')!);
  vi.mocked(fetchLemmaPickerShard).mockResolvedValueOnce({areth:{n:3,c:[{h:'ἄλλος',k:'allos',s:'allos'}]}});
  await fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(container.querySelector('main')?.dataset.searchBusy).toBe('false'));
  expect(container.querySelector('.b-sr-t')?.textContent).not.toContain('excellence');
  expect(container.querySelector('.b-sr-t')?.textContent).toContain('for ἀρετή');
});

it('shows the own-form gloss and Lexicon despite the live map’s second verb reading', async () => {
  vi.mocked(lemmaOptions).mockResolvedValueOnce([['aretaw', 'areth']]);
  const {container} = await run();
  expect(container.querySelector('.b-sr-t')?.textContent).toContain('excellence');
  expect(screen.getByRole('link', {name: 'Lexicon'}).getAttribute('href')).toBe('/lemma/arete/');
});
it('omits gloss and Lexicon for ἦν, whose folded key also names the headword ἤν', async () => {
  vi.mocked(lemmaOptions).mockResolvedValueOnce([['ean', 'eimi', 'hmi', 'hn', 'os']]);
  vi.mocked(fetchLemmaPickerShard).mockResolvedValueOnce({hn: {n: 5, c: [{h: 'ἤν', k: 'h)/n1', s: 'en-test'}]}});
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  const {container} = render(Search, {props: {b: true}});
  await fireEvent.input(screen.getByRole('searchbox', {name: 'Search Greek'}), {target: {value: 'ἦν'}});
  await fireEvent.submit(container.querySelector('form')!);
  await waitFor(() => expect(container.querySelector('main')?.dataset.searchBusy).toBe('false'));
  expect(container.querySelector('.b-sr-t')?.textContent).not.toContain('excellence');
  expect(screen.queryByRole('link', {name: 'Lexicon'})).toBeNull();
});
it('shows the printed hit line, without word-window marks or neighbouring lines', async () => {
  const original = book.segments[0].greek;
  book.segments[0].greek = [
    {n: 1, text: 'πρότερον', tokens: [{t: 'πρότερον', o: 0, k: 'proteron'}]},
    {n: 2, text: 'ἡ ἀρετή.', tokens: [{t: 'ἡ', o: 0, k: 'h'}, {t: 'ἀρετή', o: 2, k: 'areth'}]},
    {n: 3, text: 'ὕστερον', tokens: [{t: 'ὕστερον', o: 0, k: 'usteron'}]},
  ];
  vi.mocked(search).mockResolvedValueOnce({results: [{...results[0], grkPositions: [2]}], failedWorks: []});
  try {
    const {container} = await run();
    expect(container.querySelector('.b-hg')?.textContent).toBe('ἡ ἀρετή.');
    expect(container.querySelector('.b-hg .tok.hit')?.textContent).toBe('ἀρετή');
  } finally { book.segments[0].greek = original; }
});
it('cuts English at a word boundary within 160 characters and keeps the translator inline', async () => {
  const original = book.segments[0].english.text;
  book.segments[0].english.text = 'Virtue is discussed here. '.repeat(12);
  vi.mocked(search).mockResolvedValueOnce({results: [results[0]], failedWorks: []});
  try {
    const {container} = await run();
    const paragraph = container.querySelector('.b-he')!;
    const text = paragraph.firstChild!.textContent!.trim();
    expect(text.length).toBeLessThanOrEqual(160);
    expect(text).toMatch(/here\.…$/);
    expect(paragraph.tagName).toBe('P');
    expect(paragraph.querySelector('span a')?.textContent).toBe('Rackham');
  } finally { book.segments[0].english.text = original; }
});

it('cuts marked English without breaking its markup', async () => {
  const original = book.segments[0].english.text;
  book.segments[0].english.text = 'Virtue is discussed here. '.repeat(12);
  vi.mocked(search).mockResolvedValueOnce({results: [{...results[0], grkMatch: false, engMatch: true, engHits: [{translation: 'rackham', positions: [0]}]}], failedWorks: []});
  try {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
    const {container} = render(Search, {props: {b: true}});
    await fireEvent.click(screen.getByRole('button', {name: 'English'}));
    await fireEvent.input(screen.getByRole('searchbox', {name: 'Search English'}), {target: {value: 'virtue'}});
    await fireEvent.submit(container.querySelector('form')!);
    await waitFor(() => expect(container.querySelector('main')?.dataset.searchBusy).toBe('false'));
    const paragraph = container.querySelector('.b-he')!;
    const copy = paragraph.cloneNode(true) as HTMLElement;
    copy.querySelector('span')!.remove();
    expect(copy.textContent!.trim().length).toBeLessThanOrEqual(160);
    expect(copy.querySelector('mark')?.textContent).toBe('Virtue');
    expect(paragraph.querySelector('span a')?.getAttribute('href')).toContain('trans=rackham');
  } finally { book.segments[0].english.text = original; }
});
