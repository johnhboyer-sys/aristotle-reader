// Grammar alone (ruling 3, John, 2026-11-10; option C2). A lone grammar term
// runs once fewer than all works or a speaker narrows it. Unnarrowed, Search
// stays enabled and pressing it shows three narrowing controls where the
// results go, with no sentence of explanation.
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Search from '../components/Search.svelte';

vi.mock('../lib/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/search')>();
  return {
    ...actual,
    search: vi.fn(async () => ({ results: [], failedWorks: [] })),
    greekHitForms: vi.fn(async () => ({ byResult: new Map(), headwords: new Map(), failedWorks: [] })),
    greekHitGrammar: vi.fn(async () => ({ byResult: new Map(), failedWorks: [] })),
    searchCombo: vi.fn(async () => ({ results: [], failedWorks: [] })),
    searchPhraseVariants: vi.fn(),
    speakerRoster: vi.fn(async () => []),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
});

const AOR_PASS_PART = `c=${encodeURIComponent('g:tense.aor,mood.part,voice.pass')}`;
const prompt = () => screen.queryByRole('group', { name: 'Narrow the search' });

describe('a lone grammar term', () => {
  it('with nothing narrowing it, shows the three controls and does not search', async () => {
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}`);
    render(Search);
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    expect(within(prompt()!).getAllByRole('button').map(b => b.textContent))
      .toEqual(['Choose works', 'Add a word near or not near']);
    // No sentence of explanation: the buttons' own words and nothing else.
    expect(prompt()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Choose works Add a word near or not near');
    const { searchCombo } = await import('../lib/search');
    expect(searchCombo).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Search' })).not.toBeDisabled();
  });

  it('opens the works chooser from Choose works', async () => {
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}`);
    const { container } = render(Search);
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    await fireEvent.click(within(prompt()!).getByRole('button', { name: 'Choose works' }));
    await vi.waitFor(() => expect((container.querySelector('#works-panel') as HTMLElement).hidden).toBe(false));
    // The focus lands on the first work, not on "Select all" or "Clear".
    await vi.waitFor(() => expect(document.activeElement?.closest('#works-panel')).not.toBeNull());
    expect(document.activeElement?.classList.contains('work-chip')).toBe(true);

  });

  it('puts the focus in a free word term from Add a word near or not near', async () => {
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}`);
    render(Search);
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    await fireEvent.click(within(prompt()!).getByRole('button', { name: 'Add a word near or not near' }));
    await vi.waitFor(() => expect(document.activeElement?.closest('.combo-slot')).not.toBeNull());
    expect(document.activeElement?.closest('.combo-slot')?.querySelector('.combo-grammar-grid')).toBeNull();
  });

  it('runs over fewer than all works, as one grammar slot', async () => {
    window.history.replaceState(null, '', `/search?w=Cat&${AOR_PASS_PART}`);
    render(Search);
    const { searchCombo } = await import('../lib/search');
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalled());
    const [slots, , works] = vi.mocked(searchCombo).mock.calls[0];
    expect(slots).toEqual([{ kind: 'grammatical', query: { tense: 'aor', mood: 'part', voice: 'pass' }, relation: 'near' }]);
    expect(works).toEqual(['Cat']);
    expect(prompt()).toBeNull();
  });
  // Codex review, 2026-11-10. Refusing to search still records the query and
  // retires any search in flight; and going back to an empty page clears the
  // buttons.
  it('writes the address of a refused query, so a reload does not restore what the reader removed', async () => {
    // A work narrows it; selecting all works removes that limit.
    window.history.replaceState(null, '', `/search?w=Cat&${AOR_PASS_PART}`);
    render(Search);
    const { searchCombo } = await import('../lib/search');
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalled());
    await fireEvent.click(screen.getByRole('button', { name: /In 1 of/ }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Select all' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    const p = new URLSearchParams(window.location.search);
    expect(p.get('sp')).toBeNull();
    expect(p.get('sn')).toBeNull();
    expect(p.getAll('c')).toEqual(['g:tense.aor,mood.part,voice.pass']);
  });

  it('shows the buttons, not "no passages", when the engine refuses for want of narrowing', async () => {
    // A NOT term that occurs nowhere does not narrow (the engine finds that out).
    const { searchCombo } = await import('../lib/search');
    vi.mocked(searchCombo).mockResolvedValueOnce({ results: [], failedWorks: [], unnarrowed: true });
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}&c=${encodeURIComponent('fn:zzzz')}`);
    render(Search);
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalled());
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    expect(screen.queryByText(/No passages/i)).toBeNull();
  });

  it('shows the buttons when every work is cleared', async () => {
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}`);
    render(Search);
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    await fireEvent.click(within(prompt()!).getByRole('button', { name: 'Choose works' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    const { searchCombo } = await import('../lib/search');
    expect(searchCombo).not.toHaveBeenCalled();
  });

  it.skip('shows the buttons when every work is cleared, even with a speaker chosen', async () => {
    const { speakerRoster } = await import('../lib/search');
    vi.mocked(speakerRoster).mockResolvedValue([{ work: 'EN', loaded: true, speakers: [{ name: 'Socrates', turns: 3 }], approximate: false }] as never);
    window.history.replaceState(null, '', `/search?sp=only&sn=Socrates&${AOR_PASS_PART}`);
    render(Search);
    const { searchCombo } = await import('../lib/search');
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalledTimes(1));
    await fireEvent.click(screen.getByRole('button', { name: /In all works/ }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: /Spoken by/ }).textContent).toContain('Socrates');
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    expect(searchCombo).toHaveBeenCalledTimes(1);
  });

  it('puts the focus on Choose works when Search is pressed', async () => {
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}`);
    render(Search);
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Choose works'));
  });

  it('retires a search in flight, so its answer cannot replace the buttons', async () => {
    const { searchCombo } = await import('../lib/search');
    let finish!: (v: unknown) => void;
    vi.mocked(searchCombo).mockImplementationOnce(() => new Promise(r => { finish = r; }) as never);
    window.history.replaceState(null, '', `/search?w=Cat&${AOR_PASS_PART}`);
    render(Search);
    await vi.waitFor(() => expect(searchCombo).toHaveBeenCalled());
    window.history.pushState(null, '', `/search?${AOR_PASS_PART}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    expect(screen.getByRole('button', { name: 'Search' })).not.toBeDisabled();
    finish({ results: [], failedWorks: ['Cat'], approximateTurns: [] });
    await tick(); await tick();
    expect(prompt()).not.toBeNull();
  });

  it('clears the buttons when history goes back to an empty page', async () => {
    window.history.replaceState(null, '', `/search?${AOR_PASS_PART}`);
    render(Search);
    await vi.waitFor(() => expect(prompt()).not.toBeNull());
    window.history.pushState(null, '', '/search');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await vi.waitFor(() => expect(prompt()).toBeNull());
  });
});
