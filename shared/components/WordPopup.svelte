<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { lookupWord, fetchLemmata, type Analysis, type LsjEntry, type LemmaRef } from '../lib/data';
  import { betaToGreek } from '../lib/betacode';
  import { sanitizeHtml } from '../lib/html';

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
      {#each analyses as a}
        <div class="analysis-card">
          <div class="lemma" lang="grc">{a.lsj[0] ? lsj.find(e => e.key === a.lsj[0])?.head ?? betaToGreek(a.lemma) : betaToGreek(a.lemma)}</div>
          <div class="gloss">{a.gloss}</div>
          <div class="parse">{a.parse}</div>
          {#if lemmaRef(a)}
            <a class="lemma-link" href={`${base}/lemma/${lemmaRef(a)!.slug}/`}>
              Appears {lemmaRef(a)!.count.toLocaleString()}× across Aristotle
              <span class="lemma-link-arr" aria-hidden="true">→</span>
            </a>
          {/if}
        </div>
      {/each}
      {#if lsj.length > 0}
        <div class="lsj-section">
          <div class="lsj-label">LSJ</div>
          {#each lsj as entry}
            <div class="lsj-entry">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html sanitizeHtml(entry.html)}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
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
