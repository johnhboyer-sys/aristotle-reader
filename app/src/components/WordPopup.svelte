<script lang="ts">
  import { fly } from 'svelte/transition';
  import { lookupWord, fetchLemmata, type Analysis, type LsjEntry, type LemmaRef } from '../lib/data';
  import { betaToGreek } from '../lib/betacode';

  export let work: string = 'EN';
  export let token: { t: string; k: string };
  export let anchor: { x: number; y: number } = { x: 0, y: 0 };
  export let onClose: () => void;

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

  lookupWord(work, token.k)
    .then(r => { analyses = r.analyses; lsj = r.lsj; })
    .catch(e => { error = String(e); })
    .finally(() => { loading = false; });

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
</script>

<svelte:window on:keydown={onKey} />

<div class="popup-backdrop" on:click={onClose} on:keydown={() => {}} role="presentation"></div>

<!-- Desktop: slide-in sidebar. Mobile: bottom sheet. Both via CSS. -->
<aside
  class="word-sidebar"
  transition:fly={isMobile ? { y: 600, duration: 260, opacity: 1 } : { x: 420, duration: 220, opacity: 1 }}
  role="dialog"
  aria-label="Word analysis"
>
  <div class="word-sidebar-head">
    <span class="popup-surface">{token.t}</span>
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
          <div class="lemma">{a.lsj[0] ? lsj.find(e => e.key === a.lsj[0])?.head ?? betaToGreek(a.lemma) : betaToGreek(a.lemma)}</div>
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
              {@html entry.html}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</aside>

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
