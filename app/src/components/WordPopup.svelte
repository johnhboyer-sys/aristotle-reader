<script lang="ts">
  import { lookupWord, type Analysis, type LsjEntry } from '../lib/data';

  export let token: { t: string; k: string };
  export let anchor: { x: number; y: number };
  export let onClose: () => void;

  let analyses: Analysis[] = [];
  let lsj: LsjEntry[] = [];
  let loading = true;
  let error = '';

  // Position popup so it stays inside the viewport
  function clampedPos(x: number, y: number) {
    const W = 480, H = 600, vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.min(x, vw - W - 16) + 'px',
      top:  Math.min(y + 8, vh - H - 16) + 'px',
    };
  }

  $: pos = clampedPos(anchor.x, anchor.y);

  lookupWord(token.k)
    .then(r => { analyses = r.analyses; lsj = r.lsj; })
    .catch(e => { error = String(e); })
    .finally(() => { loading = false; });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- Transparent backdrop catches outside clicks -->
<div class="popup-backdrop" on:click={onClose} on:keydown={() => {}} role="presentation"></div>

<div
  class="popup"
  style="left:{pos.left};top:{pos.top}"
  role="dialog"
  aria-label="Word analysis"
>
  <div class="popup-header">
    <span class="popup-surface">{token.t}</span>
    <button class="popup-close" on:click={onClose} aria-label="Close">✕</button>
  </div>

  <div class="popup-body">
    {#if loading}
      <div class="popup-loading">Looking up…</div>
    {:else if error}
      <div class="popup-loading">Error: {error}</div>
    {:else if analyses.length === 0}
      <div class="popup-loading">No analysis found for this form.</div>
    {:else}
      {#each analyses as a}
        <div class="analysis-card">
          <div class="lemma">{a.lsj[0] ? lsj.find(e => e.key === a.lsj[0])?.head ?? a.lemma : a.lemma}</div>
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
</div>
