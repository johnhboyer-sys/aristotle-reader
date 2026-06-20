<script lang="ts">
  import { fetchFootnotes } from '../lib/data';

  export let work: string = 'EN';
  export let n: string;
  export let anchor: { x: number; y: number };
  export let onClose: () => void;
  // Hover bridge: cancel/schedule the parent's close timer so the cursor can
  // move from the `[^N]` marker into the popup without it disappearing.
  export let onHoverIn: () => void = () => {};
  export let onHoverOut: () => void = () => {};

  let html = '';
  let loading = true;
  let error = '';

  // Keep the popup inside the viewport (anchored below the marker).
  function clampedPos(x: number, y: number) {
    const W = 440, H = 360, vw = window.innerWidth, vh = window.innerHeight;
    return {
      left: Math.max(8, Math.min(x, vw - W - 16)) + 'px',
      top:  Math.min(y + 8, vh - H - 16) + 'px',
    };
  }

  $: pos = clampedPos(anchor.x, anchor.y);

  fetchFootnotes(work)
    .then(map => { html = map[n] ?? ''; if (!html) error = `Footnote ${n} not found.`; })
    .catch(e => { error = String(e); })
    .finally(() => { loading = false; });

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<div
  class="popup footnote-popup"
  style="left:{pos.left};top:{pos.top}"
  role="dialog"
  aria-label="Footnote {n}"
  on:mouseenter={onHoverIn}
  on:mouseleave={onHoverOut}
>
  <div class="popup-header">
    <span class="footnote-num">Note {n}</span>
    <button class="popup-close" on:click={onClose} aria-label="Close">✕</button>
  </div>

  <div class="popup-body">
    {#if loading}
      <div class="popup-loading">Loading…</div>
    {:else if error}
      <div class="popup-loading">{error}</div>
    {:else}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="footnote-text">{@html html}</div>
    {/if}
  </div>
</div>
