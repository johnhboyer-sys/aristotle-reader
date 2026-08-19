// The desktop lexicon renders LSJ through the same shared renderer as the site
// (sanitized, sense hierarchy intact, sense outline) — but it is an OVERLAY
// over the reader, so its outline must never touch location.hash: App.svelte
// reads that hash as the live citation for the rail and Copy Citation.
import { fireEvent, render, screen } from '@testing-library/svelte';
import LexiconEntry from '../components/LexiconEntry.svelte';

const ENTRY =
  '<b class="lsj-head">λόγος</b>, ' +
  '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">A.</b> computation' +
  '<div class="lsj-sense" data-level="2"><b class="lsj-sense-n">I.</b> account of money' +
  '</div></div>' +
  '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">B.</b> relation</div>' +
  '<div class="lsj-sense" data-level="1"><b class="lsj-sense-n">C.</b> explanation</div>';

vi.mock('@shared/lib/data', () => ({
  lsjShard: vi.fn(() => 'l'),
  fetchLsjShard: vi.fn(async () => ({ 'lo/gos': { key: 'lo/gos', head: 'λόγος', html: ENTRY } })),
}));

const LEMMA = {
  slug: 'logos', key: 'lo/gos', head: 'λόγος', lemmaBeta: 'lo/gos',
  count: 2417, glosses: ['word, account'],
  byWork: [{ work: 'EN', title: 'Nicomachean Ethics', count: 231 }],
  instancesByWork: [], truncated: false,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => LEMMA })));
  location.hash = '';
});

const mount = () =>
  render(LexiconEntry, { props: { slug: 'logos', onJumpTo: vi.fn(), onBack: vi.fn() } });

describe('LexiconEntry LSJ rendering', () => {
  it('keeps the sense hierarchy and adds the outline', async () => {
    const { container } = mount();
    await screen.findByText('Dictionary (LSJ)');

    const entry = container.querySelector('.lsj-entry.lsj-entry-page')!;
    expect(entry).toBeTruthy();
    expect(entry.querySelector('.lsj-sense[data-level="1"] .lsj-sense[data-level="2"]'))
      .toBeTruthy();
    expect(entry.querySelectorAll('.lsj-outline-list a')).toHaveLength(3);
  });

  it('scrolls to a sense without writing location.hash', async () => {
    const { container } = mount();
    await screen.findByText('Dictionary (LSJ)');

    const link = container.querySelector<HTMLAnchorElement>('.lsj-outline-list a')!;
    const target = container.querySelector<HTMLElement>(`#${link.getAttribute('href')!.slice(1)}`)!;
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    await fireEvent.click(link);

    expect(scrollIntoView).toHaveBeenCalled();
    expect(location.hash).toBe('');
  });
});
