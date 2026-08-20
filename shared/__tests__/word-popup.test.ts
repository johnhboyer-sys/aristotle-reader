// Regression tests for the 2026-07-29 word-popup bug report (ported from
// plato-reader): with the word panel open, clicking another Greek word must
// swap the analysis in place — the old full-page backdrop swallowed that click
// and forced close/reopen with two page snaps.
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import WordPopup from '../components/WordPopup.svelte';
import { prefixLsjCitationHrefs } from '../lib/html';
import { fetchLemmata, lookupWord } from '../lib/data';

vi.mock('../lib/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data')>();
  return {
    ...actual,
    fetchLemmata: vi.fn(async () => ({})),
    lookupWord: vi.fn(async (_work: string, k: string) => ({
      analyses: [
        k === 'logos'
          ? { lemma: 'logos', gloss: 'word, account', parse: 'noun nom sg', lsj: [] }
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
  it('prepends the site base to LSJ citation links', () => {
    expect(prefixLsjCitationHrefs(
      '<a class="lsj-bibl" href="/EN/book/1?loc=1094a:5">1094a5</a>',
      '/aristotle-reader',
    )).toBe(
      '<a class="lsj-bibl" href="/aristotle-reader/EN/book/1?loc=1094a:5">1094a5</a>',
    );
  });

  // The rewrite pattern matches the SANITIZED serialization, not stage5's raw
  // output — if sanitizeHtml ever reorders attributes, the rewrite misses
  // silently and readers get base-less 404 links. Lock the round trip.
  it('rewrites citation links after the sanitize round trip', async () => {
    const { sanitizeHtml } = await import('../lib/html');
    const sanitized = sanitizeHtml(
      '<a class="lsj-bibl" href="/APo/book/1?loc=71a:3">71a3</a>',
    );
    const rewritten = prefixLsjCitationHrefs(sanitized, '/aristotle-reader');
    expect(rewritten).toContain('href="/aristotle-reader/APo/book/1?loc=71a:3"');
  });

  it('is idempotent and leaves an empty or bare-slash base alone', () => {
    const html = '<a class="lsj-bibl" href="/EN/book/1?loc=1094a:5">1094a5</a>';
    const once = prefixLsjCitationHrefs(html, '/aristotle-reader');
    expect(prefixLsjCitationHrefs(once, '/aristotle-reader')).toBe(once);
    expect(prefixLsjCitationHrefs(html, '')).toBe(html);
    expect(prefixLsjCitationHrefs(html, '/')).toBe(html);
  });

  // The popup renders LSJ through the shared renderLsjEntry, so the sense
  // hierarchy has to survive into its DOM — it was stripped there too until
  // the sanitizer allowed the sense divs (2026-08-19).
  it('renders an LSJ entry with its sense hierarchy intact', async () => {
    vi.mocked(lookupWord).mockResolvedValueOnce({
      analyses: [{ lemma: 'logos', gloss: 'word, account', parse: 'noun nom sg', lsj: ['logos'] }],
      lsj: [{
        key: 'logos',
        head: 'λόγος',
        html: '<b class="lsj-head">λόγος</b>, '
          + '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> computation'
          + '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> account of money'
          + '</div></div>',
      }],
    });
    const { container } = render(WordPopup, { props: { ...baseProps, onClose: vi.fn() } });
    await screen.findByText('word, account');

    const entry = container.querySelector('.lsj-entry')!;
    expect(entry).toBeTruthy();
    expect(entry.querySelector('.lsj-sense[data-level="1"]')).toBeTruthy();
    // Nested, not flattened: the sub-sense sits INSIDE its parent sense.
    expect(entry.querySelector('.lsj-sense[data-level="1"] .lsj-sense[data-level="2"]'))
      .toBeTruthy();
    // The popup is a sidebar: no jump list, and no anchor ids to collide with
    // the reader's own.
    expect(entry.querySelector('.lsj-outline')).toBeNull();
    expect(entry.querySelector('[id]')).toBeNull();
  });

  it('re-runs the lookup when the token changes (word-to-word jump)', async () => {
    const { rerender } = render(WordPopup, {
      props: { ...baseProps, onClose: vi.fn() },
    });
    await screen.findByText('word, account');

    await rerender({ token: { t: 'ἀρετή', k: 'areth' } });
    await screen.findByText('goodness, excellence');
    expect(lookupWord).toHaveBeenCalledTimes(2);
    expect(lookupWord).toHaveBeenLastCalledWith('EN', 'areth');
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

    // Anywhere else: close.
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(onClose).toHaveBeenCalledTimes(1);

    tok.remove();
  });

  it('closes even when the outside click stops propagation (footnote marker)', async () => {
    // Reader's fn-marker / Bekker-info / print-menu handlers stopPropagation();
    // the close listener runs in the capture phase so it still sees the click
    // (John's ruling 2026-07-29: a footnote click closes the word panel).
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

  it('does NOT close on a bare pointerdown (touch pan / selection drag / right-click)', async () => {
    // A pan or drag produces pointerdown with no click; closing there would
    // dismiss the panel the moment a touch scroll starts (Sol review catch).
    const onClose = vi.fn();
    render(WordPopup, { props: { ...baseProps, onClose } });
    await screen.findByText('word, account');

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
    await tick();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders no click-blocking backdrop', async () => {
    render(WordPopup, { props: { ...baseProps, onClose: vi.fn() } });
    await screen.findByText('word, account');
    expect(document.querySelector('.popup-backdrop')).toBeNull();
  });

  it('renders distinctiveness_label when the lemma ref carries one', async () => {
    vi.mocked(fetchLemmata).mockResolvedValue({
      logos: { slug: 'logos', head: 'λόγος', count: 10, distinctiveness_label: 'coined by Aristotle' },
    });
    vi.mocked(lookupWord).mockResolvedValue({
      analyses: [{ lemma: 'logos', gloss: 'word, account', parse: 'noun nom sg', lsj: ['logos'] }],
      lsj: [],
    });
    render(WordPopup, { props: { ...baseProps, onClose: vi.fn() } });
    expect(await screen.findByText('coined by Aristotle')).toBeInTheDocument();
    expect(screen.getByText(/Appears 10/)).toBeInTheDocument();
  });

  it('renders no distinctiveness line when the lemma ref has none', async () => {
    vi.mocked(fetchLemmata).mockResolvedValue({
      logos: { slug: 'logos', head: 'λόγος', count: 10 },
    });
    vi.mocked(lookupWord).mockResolvedValue({
      analyses: [{ lemma: 'logos', gloss: 'word, account', parse: 'noun nom sg', lsj: ['logos'] }],
      lsj: [],
    });
    render(WordPopup, { props: { ...baseProps, onClose: vi.fn() } });
    await screen.findByText(/Appears 10/);
    expect(screen.queryByText('coined by Aristotle')).toBeNull();
    expect(screen.queryByText('rare before Aristotle')).toBeNull();
    expect(document.querySelector('.distinct-label')).toBeNull();
  });
});
