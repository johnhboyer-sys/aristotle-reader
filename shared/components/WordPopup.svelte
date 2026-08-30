<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { lookupWord, fetchLemmata, type Analysis, type LsjEntry, type LemmaRef } from '../lib/data';
  import { betaToGreek } from '../lib/betacode';
  import { renderLsjEntry } from '../lib/html';

  export let work: string = 'EN';
  export let token: { t: string; k: string };
  export const anchor: { x: number; y: number } = { x: 0, y: 0 };
  export let onClose: () => void;

  let dialogEl: HTMLDivElement;
  let previousFocus: HTMLElement | null = null;
  let analyses: Analysis[] = [];
  let lsj: LsjEntry[] = [];
  let loading = true;
  let error = '';
  // Resolved synchronously at instantiation (this component only ever mounts
  // client-side, on a word click) so the intro transition picks the right
  // direction: mobile rises from the bottom, desktop slides in from the right.
  // Reading it in onMount would be too late — Svelte evaluates transition
  // params when the element mounts, before onMount runs.
  const isMobile = typeof window !== 'undefined'
    && window.matchMedia('(max-width: 680px)').matches;

  // Reload when the clicked word changes. The sidebar switches word in place —
  // Reader reassigns `token` without remounting this component (see the
  // .word-open comment in Reader.svelte) — so a one-shot load at creation would
  // leave the PREVIOUS word's analyses/LSJ sitting under the new headword. The
  // monotonic request id discards a slow earlier lookup that resolves after a
  // newer click.
  let reqId = 0;
  $: loadWord(work, token.k);
  function loadWord(w: string, k: string) {
    const my = ++reqId;
    loading = true;
    error = '';
    analyses = [];
    lsj = [];
    lookupWord(w, k)
      .then(r => { if (my === reqId) { analyses = r.analyses; lsj = r.lsj; } })
      .catch(e => { if (my === reqId) error = String(e); })
      .finally(() => { if (my === reqId) loading = false; });
  }

  // The lemma-page manifest (loaded once, cached): lets each analysis card offer
  // a "see all N occurrences" link into /lemma/<slug>, but only for lemmata that
  // actually have a page. Absent manifest = no links, popup unchanged.
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  let lemmata: Record<string, LemmaRef> = {};
  fetchLemmata().then(m => { lemmata = m; }).catch(() => {});
  // A card's lemma page keys off its primary LSJ key (matching the concordance).
  const lemmaRef = (a: Analysis): LemmaRef | null =>
    (a.lsj[0] && lemmata[a.lsj[0]]) || null;

  // ── The dictionary entry ────────────────────────────────────────────────
  // Served by grammata (grammar-site's deploy), not rendered here: one grammata
  // deploy updates every reader site. Architecture decided 2026-08-29. Do not
  // vendor, proxy, pin or cache-bust this URL — its deploys ARE the update
  // mechanism — and do not style anything inside the container: the widget's
  // CSS is generated from grammata's design system and changes with it.
  const GRAMMATA_LOOKUP = 'https://grammata.pages.dev/t8/lookup.js';
  // The packaged desktop app bundles its corpus and is offline-first, so it
  // keeps rendering the local LSJ shards. Same check runtime.ts uses.
  const useLocalLexicon =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  type LookupFn = (
    word: string,
    el: HTMLElement,
    opts?: { lang?: string; key?: string },
  ) => Promise<void>;

  let lexEl: HTMLDivElement | undefined;
  let lexLoader: Promise<LookupFn> | null = null;
  // Loaded on the first word click, then reused: the import is the only cost
  // paid before a lookup, and the browser caches the module after that.
  function loadLookup(): Promise<LookupFn> {
    // @vite-ignore keeps the remote specifier out of the bundle graph — Vite
    // cannot resolve an https: import at build time and would fail the build.
    if (!lexLoader) lexLoader = import(/* @vite-ignore */ GRAMMATA_LOOKUP).then(m => m.lookup);
    return lexLoader;
  }

  // The sidebar switches word in place (see loadWord above), so this re-runs on
  // a new token rather than remounting. Its own counter, not loadWord's: the
  // two requests resolve independently and a slow earlier entry must not land
  // in the container after a newer click.
  let lexId = 0;
  // ── Cards are keyed by DICTIONARY ENTRY, not by Morpheus lemma ──────────
  // An analysis can name several LSJ entries (νοῦν's unnumbered νέω points at
  // all three of νέω A/B/C). Keying on the entry means its parses join each of
  // those entries' cards, no card ever names more than one entry, and there is
  // no unresolved-parent card that opens nothing. νοῦν: 17 cards -> 4.
  const DIALECTS = ['attic', 'epic', 'doric', 'ionic', 'aeolic', 'homeric'];

  // Aristotle is Attic, so Attic is the unmarked default and never printed.
  // A form with NO Attic reading is worth doubting, so it says what it is
  // limited to. Cuts on Attic's presence, not on how many dialects are named:
  // "(attic)" alone would otherwise flag (meaningless here) and "(epic ionic)"
  // would otherwise stay silent (exactly the case worth seeing). 2,007 of
  // 15,041 analyses flag — 13%.
  function splitParse(parse: string): { text: string; dialect: string } {
    const m = /\(([^)]*)\)\s*$/.exec(parse ?? '');
    if (!m) return { text: (parse ?? '').trim(), dialect: '' };
    const named = m[1].split(/\s+/).filter(w => DIALECTS.includes(w));
    if (named.length === 0) return { text: (parse ?? '').trim(), dialect: '' };
    const text = parse.slice(0, m.index).trim();
    if (named.includes('attic')) return { text, dialect: '' };
    return { text, dialect: named.length === 1 ? `${named[0]} only` : named.join(' ') };
  }

  // LSJ marks its own homographs — νέω (A), νέω (B), νέω (C) — in the entry
  // text itself. Read that, never derive it from the key's trailing digit:
  // ka/r2 is LSJ's (A), not (B), and li^to/s2 is (A) too, so the digit lies in
  // 6 cases. 32% of numbered keys carry no letter at all (a)/llos1), and those
  // show nothing rather than being given a letter LSJ never printed.
  function homograph(html: string | undefined): string {
    if (!html) return '';
    const m = /^\s*\S+\s*\(([A-Z])\)/.exec(html.replace(/<[^>]+>/g, ''));
    return m ? m[1] : '';
  }

  interface EntryCard {
    id: string;
    lsjKey: string;          // '' when this analysis names no LSJ entry
    head: string;
    hom: string;             // LSJ's own homograph letter, '' when unmarked
    gloss: string;
    rows: { text: string; dialect: string }[];
    ref: LemmaRef | null;
  }

  $: cards = (() => {
    const out: EntryCard[] = [];
    const byId = new Map<string, EntryCard>();
    for (const a of analyses) {
      const keys = a.lsj && a.lsj.length ? a.lsj : [''];
      for (const k of keys) {
        const id = k || `lemma:${a.lemma}`;
        let card = byId.get(id);
        if (!card) {
          const entry = k ? lsj.find(e => e.key === k) : undefined;
          card = {
            id,
            lsjKey: k,
            head: entry?.head || betaToGreek(a.lemma),
            hom: homograph(entry?.html),
            gloss: a.gloss,
            rows: [],
            ref: (k && lemmata[k]) || null,
          };
          byId.set(id, card);
          out.push(card);
        }
        const row = splitParse(a.parse);
        // Drop rows this card already carries: an analysis naming three
        // entries repeats its parse into all three, and the corpus holds 701
        // byte-identical duplicates besides.
        if (!card.rows.some(r => r.text === row.text && r.dialect === row.dialect)) {
          card.rows.push(row);
        }
      }
    }
    return out;
  })();

  // Which card's entry is open. One at a time: the panel is narrow and the
  // reader came for one definition, not a stack.
  let openId = '';
  // Reset when the sidebar switches word in place, or the previous word's
  // entry would sit open under a new set of cards.
  $: if (token) openId = '';

  function toggleCard(card: EntryCard, el: HTMLElement | undefined) {
    openId = openId === card.id ? '' : card.id;
    if (openId && !useLocalLexicon && el) renderLexicon(el, card.head, card.lsjKey);
  }

  async function renderLexicon(el: HTMLElement, word: string, key: string) {
    const my = ++lexId;
    try {
      const lookup = await loadLookup();
      if (my !== lexId) return;
      // lang:'grc' skips the Latin fetch outright on a Greek reader. With a
      // key the word argument is ignored, so it stays empty; without one the
      // widget re-analyses the Unicode headword and may stack fold-siblings.
      await lookup(key ? '' : word, el, key ? { lang: 'grc', key } : { lang: 'grc' });
    } catch (e) {
      // A failed module load is the only case the widget cannot report itself
      // (it renders its own not-found and network-failure states).
      if (my === lexId) el.textContent = 'Word data is not available here.';
      console.error('[grammata] lookup failed', e);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  // Close on any CLICK outside the panel — EXCEPT on a Greek token, whose
  // own click handler swaps the popup to the new word. (A blocking backdrop
  // here would swallow that click and force close-then-reopen, with two page
  // reflows; see the bug report of 2026-07-29.) Click, not pointerdown: a
  // click only fires after press+release on the same target, so a touch pan,
  // a text-selection drag, or a right-click never dismisses the panel — the
  // same tap-not-pan semantics the old backdrop had (Sol adversarial-review
  // catch, 2026-07-29). Capture phase, not bubble: Reader's footnote-marker,
  // Bekker-info, and print-menu handlers stopPropagation(), which would keep
  // the panel open behind the popup they raise — John's ruling 2026-07-29:
  // a footnote click closes the word panel.
  function onOutsideClick(e: MouseEvent) {
    const t = e.target as HTMLElement | null;
    if (!t || t.closest('.word-sidebar') || t.closest('.tok')) return;
    onClose();
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => dialogEl?.focus({ preventScroll: true }), 0);
  });

  onDestroy(() => {
    // preventScroll: the reader pins its own scroll position across the close
    // reflow; letting focus() scroll to the old word snaps the page around.
    previousFocus?.focus({ preventScroll: true });
  });
</script>

<svelte:window on:keydown={onKey} on:click|capture={onOutsideClick} />

<!-- Desktop: slide-in sidebar. Mobile: bottom sheet. Both via CSS.
     A non-modal dialog, honestly: the reader can click other words (swap),
     footnotes, and links while it is open, so aria-modal and a Tab trap would
     tell assistive tech the background is unavailable while pointer users
     interact with it freely (Sol adversarial-review catch, 2026-07-29).
     Escape still closes; focus returns to the opener. -->
<div
  class="word-sidebar"
  bind:this={dialogEl}
  transition:fly={isMobile ? { y: 600, duration: 260, opacity: 1 } : { x: 420, duration: 220, opacity: 1 }}
  role="dialog"
  aria-label="Word analysis"
  tabindex="-1"
>
  <div class="word-sidebar-head">
    <span class="popup-surface" lang="grc">{token.t}</span>
    <button class="settings-close" on:click={onClose} aria-label="Close">×</button>
  </div>
  <div class="word-sidebar-body">
    {#if loading}
      <div class="popup-loading">Looking up…</div>
    {:else if error}
      <div class="popup-loading">Error: {error}</div>
    {:else if analyses.length === 0}
      <div class="popup-loading">No analysis found for this form.</div>
    {:else}
      {#each cards as card (card.id)}
        <div class="analysis-card" class:card-open={openId === card.id}>
          <button
            type="button"
            class="card-face"
            aria-expanded={openId === card.id}
            on:click={(e) => toggleCard(card, (e.currentTarget as HTMLElement)
              .parentElement?.querySelector('.grammata-mount') as HTMLElement)}
          >
            <span class="lemma" lang="grc">{card.head}{#if card.hom}<span class="lemma-hom" lang="en"> ({card.hom})</span>{/if}</span>
            <span class="gloss">{card.gloss}</span>
            <dl class="parse-rows">
              {#each card.rows as row}
                <dt>{row.text}</dt>
                <dd>{row.dialect}</dd>
              {/each}
            </dl>
            <span class="card-open-hint">
              <span class="card-arrow" aria-hidden="true">▸</span>
              {openId === card.id ? 'Hide LSJ definition' : 'Show LSJ definition'}
            </span>
          </button>

          {#if card.ref}
            {#if card.ref.distinctiveness_label}
              <em class="distinct-label">{card.ref.distinctiveness_label}</em>
            {/if}
            <a class="lemma-link" href={`${base}/lemma/${card.ref.slug}/`}>
              Appears {card.ref.count.toLocaleString()}× across Aristotle
              <span class="lemma-link-arr" aria-hidden="true">→</span>
            </a>
          {/if}

          <div class="card-entry" hidden={openId !== card.id}>
            {#if useLocalLexicon}
              {#if card.lsjKey && lsj.find(e => e.key === card.lsjKey)}
                <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                {@html renderLsjEntry(lsj.find(e => e.key === card.lsjKey)!.html, { base })}
              {:else}
                <div class="popup-loading">No dictionary entry for this form.</div>
              {/if}
            {:else}
              <div class="grammata-mount"></div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  /* A card is one dictionary entry: headword, gloss, its parses, and the entry
     itself opening underneath. Whole face is the tap target — the reader is
     vision impaired and reads on a phone, so nothing here shrinks and nothing
     truncates. */
  .card-face {
    all: unset; box-sizing: border-box; cursor: pointer; display: flex;
    flex-direction: column; gap: 0.35rem; width: 100%; min-height: 44px;
    padding: 0.15rem 0; border-radius: 4px;
  }
  .card-face:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  /* LSJ's own homograph letter, in Latin type beside the Greek headword. */
  .lemma-hom { font-family: var(--font-ui); font-size: 0.75em; color: var(--text-light); }
  /* Parse left, dialect right — the same label-left logic as the LSJ forms
     block. The right column stays empty unless a reading has no Attic form. */
  .parse-rows {
    display: grid; grid-template-columns: max-content minmax(0, 1fr);
    gap: 0.25rem 0.75rem; margin: 0.1rem 0 0; align-items: baseline;
  }
  .parse-rows dt { color: var(--text-mid); }
  .parse-rows dd { margin: 0; color: var(--error); font-size: 0.9em; }
  /* Reads as a control, not a caption: full width, bordered, and at the
     popup's own type size. It was 0.8rem accent text with a thin chevron —
     too quiet to look tappable, and shrunk type is the one thing this reader
     cannot afford. */
  .card-open-hint {
    display: flex; align-items: center; gap: 0.5em;
    margin-top: 0.5rem; padding: 0.5rem 0.7rem; min-height: 44px;
    border: 1px solid var(--accent); border-radius: 4px;
    font-family: var(--font-ui); font-size: 1rem; font-weight: 600;
    color: var(--accent); background: transparent;
  }
  .card-face:hover .card-open-hint { background: var(--greek-hover); }
  .card-open .card-open-hint { background: var(--greek-hover); }
  .card-arrow { display: inline-block; font-size: 0.9em; transition: transform .15s ease; }
  .card-open .card-arrow { transform: rotate(90deg); }
  @media (prefers-reduced-motion: reduce) { .card-arrow { transition: none; } }
  .card-entry { margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--border); }
  /* "See all occurrences" link into the lemma page — the popup's one bridge to
     the deeper reference view. Sits at the foot of each analysis card. */
  .lemma-link {
    display: inline-flex; align-items: center; gap: 0.35em;
    margin-top: 0.5rem; font-family: var(--font-ui); font-size: 0.8rem;
    font-weight: 600; color: var(--accent); text-decoration: none;
  }
  .lemma-link:hover { text-decoration: underline; }
  .lemma-link-arr { transition: transform .1s ease; }
  .lemma-link:hover .lemma-link-arr { transform: translateX(2px); }
</style>
