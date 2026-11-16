import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';
import { AUTHENTIC_IDS } from '../lib/works';
import { search, searchCombo } from '../lib/search';

vi.mock('../lib/search', async original => ({
  ...await original<typeof import('../lib/search')>(),
  search: vi.fn(async () => ({ results: [], failedWorks: [] })),
  searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
  speakerRoster: vi.fn(async () => []),
}));
vi.mock('../lib/data', async original => ({
  ...await original<typeof import('../lib/data')>(),
  fetchLemmaPickerShard: vi.fn(async () => ({
    areth: { n: 967, c: [{ h: 'ἀρετή', k: 'a)reth/' }] },
    ecis: { n: 547, c: [{ h: 'ἕξις', k: 'e(/cis' }] },
  })),
  fetchLemmaGlosses: vi.fn(async () => []),
}));

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  vi.spyOn(window, 'matchMedia').mockImplementation(media => ({
    matches: media === '(max-width: 960px)', media, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

async function filledEditor() {
  const page = render(Search);
  await fireEvent.input(page.container.querySelector('#grk-input')!, { target: { value: 'ἀρετή' } });
  await fireEvent.click(screen.getByRole('radio', { name: 'Only as I typed it' }));
  await fireEvent.input(page.container.querySelector('#grk-input')!, { target: { value: 'ἀρετή' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Proximity search' }));
  await fireEvent.change(screen.getByRole('combobox', { name: 'Kind for term 2' }), { target: { value: 'form' } });
  await fireEvent.input(screen.getByRole('textbox', { name: 'Term 2: the word as written' }), { target: { value: 'ἕξις' } });
  return page;
}

it('searches the filled editor after Options closes it, keeps its terms, and turns it off', async () => {
  const { container } = await filledEditor();
  expect(screen.getByRole('group', { name: 'Proximity search' })).toBeInTheDocument();
  await fireEvent.click(screen.getByRole('radio', { name: 'authentic works' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(1));
  expect(search).not.toHaveBeenCalled();
  expect(vi.mocked(searchCombo).mock.calls[0][0]).toMatchObject([
    { kind: 'form', terms: ['ἀρετή'] }, { kind: 'form', terms: ['ἕξις'] },
  ]);
  expect(vi.mocked(searchCombo).mock.calls[0][2]).toEqual(AUTHENTIC_IDS);
  await fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
  expect(screen.getByRole('textbox', { name: 'Term 1: the word as written' })).toHaveValue('ἀρετή');
  expect(screen.getByRole('textbox', { name: 'Term 2: the word as written' })).toHaveValue('ἕξις');
  await fireEvent.click(screen.getByRole('button', { name: 'Turn off' }));
  await vi.waitFor(() => expect(search).toHaveBeenCalled());
});

it('closes Options when Change opens the live proximity editor', async () => {
  window.history.replaceState(null, '', '/search?c=f:ἀρετή&c=f:ἕξις');
  render(Search);
  await vi.waitFor(() => expect(searchCombo).toHaveBeenCalled());
  await fireEvent.click(screen.getByRole('button', { name: 'Change' }));
  expect(screen.queryByRole('button', { name: 'Options' })).toBeNull();
  expect(screen.getByRole('group', { name: 'Proximity search' })).toBeInTheDocument();
});

it('keeps the default lemma editor as the search when Options closes it before its first search', async () => {
  const { container } = render(Search);
  await fireEvent.input(container.querySelector('#grk-input')!, { target: { value: 'ἀρετή' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Proximity search' }));
  await vi.waitFor(() => expect(container.querySelector('.lpsel .hw')).toHaveTextContent('ἀρετή'));
  await fireEvent.input(screen.getByRole('searchbox', { name: 'Term 2: a dictionary word' }), { target: { value: 'ἕξις' } });
  await fireEvent.click(await screen.findByRole('button', { name: /ἕξις 547/ }));
  await fireEvent.click(screen.getByRole('radio', { name: 'authentic works' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(1));
  expect(search).not.toHaveBeenCalled();
  expect(vi.mocked(searchCombo).mock.calls[0][0]).toMatchObject([
    { kind: 'lemma', terms: ['areth'] }, { kind: 'lemma', terms: ['ecis'] },
  ]);
  expect(vi.mocked(searchCombo).mock.calls[0][2]).toEqual(AUTHENTIC_IDS);
  await fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
  expect([...container.querySelectorAll('.lpsel .hw')].map(el => el.textContent)).toEqual(['ἀρετή', 'ἕξις']);
});

it('describes the all-forms search for a picked lemma despite Form being as typed', async () => {
  window.history.replaceState(null, '', '/search?l=areth&m=form');
  const { container } = render(Search);
  await vi.waitFor(() => expect(search).toHaveBeenCalled());
  expect(vi.mocked(search).mock.calls[0][6]).toBe('headword');
  expect(screen.getByRole('button', { name: 'Lemma' })).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.sopt-sum')).toBeNull();
});

it.each(['Greek match', 'Greek form', 'English match', 'English form', 'Hits match'])(
  'makes the phone %s sheet a named modal with trapped focus and a return to its opener', async name => {
    const { container } = render(Search);
    await fireEvent.input(container.querySelector('#grk-input')!, { target: { value: 'λόγος' } });
    await fireEvent.input(container.querySelector('#eng-input')!, { target: { value: 'word' } });
      const menu = [...container.querySelectorAll<HTMLDetailsElement>('.search-form details.opt')]
      .find(el => el.querySelector('legend')?.textContent === name)!;
    const opener = menu.querySelector('summary')!;
    opener.focus();
    menu.open = true;
    await fireEvent(menu, new Event('toggle'));
    const dialog = screen.getByRole('dialog', { name });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
    const first = within(dialog).getAllByRole('radio').find(el => (el as HTMLInputElement).checked)!;
    const done = within(dialog).getByRole('button', { name: 'Done' });
    expect(await fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(done).toHaveFocus();
    done.focus();
    expect(await fireEvent.keyDown(done, { key: 'Tab' })).toBe(false);
    expect(first).toHaveFocus();
    expect(await fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(done).toHaveFocus();
    await fireEvent.keyDown(done, { key: 'Escape' });
    expect(menu.open).toBe(false);
    expect(opener).toHaveFocus();
    menu.open = true;
    await fireEvent(menu, new Event('toggle'));
    await fireEvent.click(within(screen.getByRole('dialog', { name })).getByRole('button', { name: 'Done' }));
    expect(menu.open).toBe(false);
    expect(opener).toHaveFocus();
    menu.open = true;
    await fireEvent(menu, new Event('toggle'));
    await fireEvent.click(container.querySelector('.sq-head')!);
    expect(menu.open).toBe(false);
    expect(opener).toHaveFocus();
  },
);

it('reserves the measured bar height for the frame and editor as the bar changes', async () => {
  let barHeight = 73;
  let resized = () => {};
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.spyOn(window, 'ResizeObserver').mockImplementation(function (callback) {
    return { observe(node: Element, options?: ResizeObserverOptions) {
      observe(node, options);
      if (node.classList.contains('prox-go')) resized = () => callback([], this as unknown as ResizeObserver);
    }, unobserve() {}, disconnect };
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { height: this.classList.contains('prox-go') ? barHeight : 0 } as DOMRect;
  });
  const frame = document.createElement('div');
  frame.className = 'frame dir-b';
  document.body.append(frame);
  const page = render(Search, { target: frame });
  await fireEvent.click(screen.getByRole('button', { name: 'Proximity search' }));
  expect(observe).toHaveBeenCalledWith(frame.querySelector('.prox-go'), { box: 'border-box' });
  for (const height of [73, 103, 126, 160]) {
    barHeight = height; // No message, one line, two lines, then a safe-area inset.
    resized();
    expect(frame.style.getPropertyValue('--prox-bar-height')).toBe(`${height}px`);
  }
  const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../styles/b-search.css'), 'utf8');
  for (const selector of ['.search-page .prox:has(.prox-go)', '.frame.dir-b:has(.search-page .prox-go)']) {
    expect(css.slice(css.indexOf(`${selector} {`)).split('}')[0]).toContain('padding-bottom: var(--prox-bar-height');
  }
  expect(css).not.toContain('.prox:has(.prox-pend) { padding-bottom: 136px; }');
  page.unmount();
  expect(frame.style.getPropertyValue('--prox-bar-height')).toBe('');
  expect(disconnect).toHaveBeenCalled();
  frame.remove();
});
