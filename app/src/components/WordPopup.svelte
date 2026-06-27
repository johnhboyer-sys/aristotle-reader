<script lang="ts">
  import { fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { lookupWord, type Analysis, type LsjEntry } from '../lib/data';
  import { betaToGreek } from '../lib/betacode';

  export let work: string = 'EN';
  export let token: { t: string; k: string };
  export let anchor: { x: number; y: number } = { x: 0, y: 0 };
  export let onClose: () => void;

  let analyses: Analysis[] = [];
  let lsj: LsjEntry[] = [];
  let loading = true;
  let error = '';
  let isMobile = false;

  onMount(() => {
    isMobile = window.matchMedia('(max-width: 680px)').matches;
  });

  lookupWord(work, token.k)
    .then(r => { analyses = r.analyses; lsj = r.lsj; })
    .catch(e => { error = String(e); })
    .finally(() => { loading = false; });

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
