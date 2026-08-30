<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { lookupWord, fetchLemmata, fetchLsjHeads, type Analysis, type LsjEntry,
           type LemmaRef, type LsjHead } from '../lib/data';
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
    // Bump the lexicon generation too: a dictionary render still in flight
    // belongs to the word being replaced.
    const my = ++reqId;
    lexId++;
    loading = true;
    error = '';
    analyses = [];
    lsj = [];
    lookupWord(w, k, { withLsj: useLocalLexicon })
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
  // Headword + homograph letter for every LSJ key, so the website never
  // downloads a letter shard just to spell a word. Absent manifest = the
  // betaToGreek fallback below, which is why nothing here throws.
  let heads: Record<string, LsjHead> = {};
  fetchLsjHeads().then(m => { heads = m; }).catch(() => {});
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
    // Whether `gloss` came from an analysis naming this entry ALONE. An
    // analysis can fan out across several entries carrying the gloss of only
    // one of them, and first-wins then mislabels the rest.
    glossExact: boolean;
    rows: { text: string; dialect: string }[];
    ref: LemmaRef | null;
  }

  $: cards = (() => {
    const out: EntryCard[] = [];
    const byId = new Map<string, EntryCard>();
    for (const a of analyses) {
      const keys = a.lsj && a.lsj.length ? a.lsj : [''];
      // An analysis naming exactly one entry describes THAT entry; one naming
      // several is unresolved and its gloss belongs to none in particular.
      // νοῦν opens with an unresolved νέω naming all three numbered entries
      // and glossing them "swim", so νέω (B) "spin" and νέω (C) "heap" both
      // read "swim" while opening the right entry underneath — a card lying
      // about the definition it is about to show.
      const exact = keys.length === 1;
      for (const k of keys) {
        const id = k || `lemma:${a.lemma}`;
        let card = byId.get(id);
        if (!card) {
          // Manifest first (website: no shard fetched at all), then the shard
          // (desktop, which has it in hand), then the lemma transliterated.
          const meta = k ? heads[k] : undefined;
          const entry = k ? lsj.find(e => e.key === k) : undefined;
          card = {
            id,
            lsjKey: k,
            head: meta?.head || entry?.head || betaToGreek(a.lemma),
            hom: meta?.hom ?? homograph(entry?.html),
            gloss: a.gloss,
            glossExact: exact,
            rows: [],
            ref: (k && lemmata[k]) || null,
          };
          byId.set(id, card);
          out.push(card);
        }
        // An exact gloss outranks a fanned-out one; failing that, any gloss
        // outranks none — some analyses carry an empty one.
        if (!card.glossExact && (exact || (!card.gloss && a.gloss))) {
          if (exact || !card.gloss) card.gloss = a.gloss;
          if (exact) card.glossExact = true;
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
      // Re-checked after the await: the reader may have moved on mid-render.
      if (my !== lexId) return;
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
