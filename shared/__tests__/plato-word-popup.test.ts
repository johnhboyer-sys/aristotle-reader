// Regression tests for the 2026-07-29 Gorgias bug report: with the word panel
// open, clicking another Greek word must swap the analysis in place — the old
// full-page backdrop swallowed that click and forced close/reopen with two
// page snaps.
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import WordPopup from '../components/WordPopup.svelte';
import { lookupWord } from '../lib/data';

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  // Forms whose analyses all name one LSJ entry, and so share one card.
  const oneEntry: Record<string, { lemma: string; gloss: string; parse: string; lsj: string[]; page?: string }[]> = {
    // λέγεις: Morpheus's three λέγω homographs all name LSJ `le/gw`; the
    // overrides rank 'say' first.
    legeis: [
      { lemma: 'le/gw3', gloss: 'say, speak; call, mean', parse: 'pres ind act 2nd sg', lsj: ['le/gw'] },
      { lemma: 'le/gw1', gloss: 'lay, lay to sleep', parse: 'pres ind act 2nd sg', lsj: ['le/gw'] },
      { lemma: 'le/gw2', gloss: 'gather, pick up', parse: 'pres ind act 2nd sg', lsj: ['le/gw'] },
    ],
    // Λακεδαιμόνιοι: LSJ prints the adjective inside Λακεδαίμων; the word keeps
    // a page of its own (pipeline lemma_pages.json).
    lakedaimonioi: [
      { lemma: '*lakedaimo/nios', gloss: 'Lacedaemonian, Spartan', parse: 'masc nom pl', lsj: ['*la^kedai/mwn'], page: '*lakedaimo/nios' },
    ],
    // διανοοῦμαι: its page is διανοέομαι, and LSJ heads `dianoe/w` διανοέομαι too.
    dianooumai: [
      { lemma: 'dianoe/w', gloss: 'have in mind', parse: 'pres ind mp 1st sg', lsj: ['dianoe/w'], page: 'dianoe/omai' },
    ],
    blankfirst: [
      { lemma: 'keno/s1', gloss: '', parse: 'adj nom sg', lsj: ['keno/s'] },
      { lemma: 'keno/s2', gloss: 'empty', parse: 'adj nom sg', lsj: ['keno/s'] },
    ],
  };
  return {
    ...actual,
    fetchLemmata: vi.fn(async () => ({
      'le/gw': { slug: 'lego', head: 'λέγω', count: 5630, ast: 'λέγω' },
      'keno/s': { slug: 'kenos', head: 'κενός', count: 12 },
      '*la^kedai/mwn': { slug: 'lakedaimon', head: 'Λακεδαίμων', count: 40 },
      '*lakedaimo/nios': { slug: 'lakedaimonios', head: 'Λακεδαιμόνιος', count: 71 },
      'dianoe/w': { slug: 'dianoeo', head: 'διανοέομαι', count: 1 },
      'dianoe/omai': { slug: 'dianoeomai', head: 'διανοέομαι', count: 256 },
    })),
    fetchLsjHeads: vi.fn(async () => ({})),
    lookupWord: vi.fn(async (_work: string, k: string) => ({
      analyses: oneEntry[k] ?? [
        k === 'logos'
          ? { lemma: 'logos', gloss: 'word, account', parse: 'noun nom sg', lsj: [] }
          : k === 'swkraths'
            // A name: Morpheus capitalises the lemma (Beta Code '*') and ships no gloss.
            ? { lemma: '*swkra/ths', gloss: '', parse: 'noun nom sg', lsj: [] }
            : k === 'blank'
              ? { lemma: 'kenos', gloss: '', parse: 'adj nom sg', lsj: [] }
              : { lemma: 'areth', gloss: 'goodness, excellence', parse: 'noun nom sg', lsj: [] },
      ],
      lsj: [],
    })),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

const baseProps = {
  work: 'EN',
  token: { t: 'λόγος', k: 'logos' },
  anchor: { x: 0, y: 0 },
};

describe('WordPopup', () => {
  it('names a blank gloss on a capitalised lemma as a proper name, and leaves other blanks blank', async () => {
    const { rerender } = render(WordPopup, {
      props: { ...baseProps, token: { t: 'Σωκράτης', k: 'swkraths' }, onClose: vi.fn() },
    });
    const note = await screen.findByText('proper name');
    expect(note.className).toContain('gloss-note');
    // A blank gloss on an ordinary lemma is not a name and gets no label.
    await rerender({ token: { t: 'κενός', k: 'blank' } });
    await screen.findByText('adj nom sg');
    expect(screen.queryByText('proper name')).toBeNull();
    expect(document.querySelector('.gloss')).toHaveTextContent('');
  });

  it('heads a word LSJ prints inside another entry with the word, links its own page, and names the entry', async () => {
    render(WordPopup, { props: { ...baseProps, token: { t: 'Λακεδαιμόνιοι', k: 'lakedaimonioi' }, onClose: vi.fn() } });
    await screen.findByText('masc nom pl');
    expect(document.querySelector('.lemma')!.textContent).toBe('Λακεδαιμόνιος');
    expect(screen.getByText('Lacedaemonian, Spartan')).toBeTruthy();
    expect(document.querySelector('.gloss-note')!.textContent).toBe('LSJ treats it under Λακεδαίμων');
    expect(document.querySelector('.lemma-link')!.getAttribute('href')).toContain('/lemma/lakedaimonios/');
  });

  it('names no other entry when LSJ heads the entry with the word itself', async () => {
    render(WordPopup, { props: { ...baseProps, token: { t: 'διανοοῦμαι', k: 'dianooumai' }, onClose: vi.fn() } });
    await screen.findByText('pres ind mp 1st sg');
    expect(document.querySelector('.lemma')!.textContent).toBe('διανοέομαι');
    expect(document.querySelector('.gloss-note')).toBeNull();
    expect(document.querySelector('.lemma-link')!.getAttribute('href')).toContain('/lemma/dianoeomai/');
  });

  it('keeps Aristotle’s later exact-gloss precedence', async () => {
    render(WordPopup, { props: { ...baseProps, token: { t: 'λέγεις', k: 'legeis' }, onClose: vi.fn() } });
    await screen.findByText('pres ind act 2nd sg');
    expect([...document.querySelectorAll('.gloss')].map(e => e.textContent)).toEqual(['gather, pick up']);
  });

  it.skip("links a card to the word's Ast entry on Lexeis when the manifest has one", async () => {
    render(WordPopup, { props: { ...baseProps, token: { t: 'λέγεις', k: 'legeis' }, onClose: vi.fn() } });
    const link = await screen.findByRole('link', { name: /Lexicon Platonicum/ });
    expect(link.getAttribute('href')).toBe(`https://lexeis.org/plato/#/entry/${encodeURIComponent('λέγω')}`);
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('shows no Ast link for a word the manifest gives no Lexeis entry', async () => {
    render(WordPopup, { props: { ...baseProps, token: { t: 'κενός', k: 'blankfirst' }, onClose: vi.fn() } });
    await screen.findByText(/Appears 12/);
    expect(screen.queryByRole('link', { name: /Lexicon Platonicum/ })).toBeNull();
  });

  it('fills a card from a later analysis when the first carries no gloss', async () => {
    render(WordPopup, { props: { ...baseProps, token: { t: 'κενός', k: 'blankfirst' }, onClose: vi.fn() } });
    await screen.findByText('adj nom sg');
    expect([...document.querySelectorAll('.gloss')].map(e => e.textContent)).toEqual(['empty']);
  });

  it('re-runs the lookup when the token changes (word-to-word jump)', async () => {
    const { rerender } = render(WordPopup, {
      props: { ...baseProps, onClose: vi.fn() },
    });
    await screen.findByText('word, account');

    await rerender({ token: { t: 'ἀρετή', k: 'areth' } });
    await screen.findByText('goodness, excellence');
    expect(lookupWord).toHaveBeenCalledTimes(2);
    // withLsj:false is the website path — grammata serves the entry, so no LSJ
    // shard is fetched. It is true only in a packaged offline build.
    expect(lookupWord).toHaveBeenLastCalledWith('EN', 'areth', { withLsj: false });
  });

  it('closes on click outside, but not on the panel or on a Greek token', async () => {
    const tok = document.createElement('span');
    tok.className = 'tok';
    document.body.appendChild(tok);

    const onClose = vi.fn();
    render(WordPopup, { props: { ...baseProps, onClose } });
    await screen.findByText('word, account');

    // On a Greek token: the token's own handler swaps the word — no close.
    tok.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(onClose).not.toHaveBeenCalled();

    // Inside the panel: no close.
    document.querySelector('.word-sidebar')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(onClose).not.toHaveBeenCalled();

    // A press alone (a touch pan starts with one) must NOT close.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await tick();
    expect(onClose).not.toHaveBeenCalled();

    // A right-button press must NOT close either.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    await tick();
    expect(onClose).not.toHaveBeenCalled();

    // Inside another overlay (command palette, footnote popup, settings…):
    // that layer owns the click — no close.
    for (const cls of ['cp-backdrop', 'footnote-popup', 'settings-sidebar']) {
      const overlay = document.createElement('div');
      overlay.className = cls;
      document.body.appendChild(overlay);
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await tick();
      expect(onClose, cls).not.toHaveBeenCalled();
      overlay.remove();
    }

    // A completed click anywhere else: close.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);

    tok.remove();
  });

  it('closes even when the outside click stops propagation (footnote marker)', async () => {
    // Reader's fn-marker / Bekker-info / print-menu handlers stopPropagation();
    // the close listener runs in the capture phase so it still sees the click
    // (John's ruling 2026-07-29: a click that raises another popup closes the
    // word panel).
    const marker = document.createElement('button');
    marker.className = 'fn-marker';
    marker.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(marker);

    const onClose = vi.fn();
    render(WordPopup, { props: { ...baseProps, onClose } });
    await screen.findByText('word, account');

    marker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);

    marker.remove();
  });

  it('is non-modal: no aria-modal claim, no Tab focus trap', async () => {
    render(WordPopup, { props: { ...baseProps, onClose: vi.fn() } });
    await screen.findByText('word, account');
    const dialog = document.querySelector('.word-sidebar')!;
    expect(dialog.getAttribute('aria-modal')).toBeNull();
    // Tab from the dialog must not be intercepted and rewired.
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    dialog.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('renders no click-blocking backdrop', async () => {
    render(WordPopup, { props: { ...baseProps, onClose: vi.fn() } });
    await screen.findByText('word, account');
    expect(document.querySelector('.popup-backdrop')).toBeNull();
  });
});
