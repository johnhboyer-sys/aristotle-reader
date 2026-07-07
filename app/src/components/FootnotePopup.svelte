<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
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
  let dialogEl: HTMLDivElement;
  let previousFocus: HTMLElement | null = null;

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

  function focusableEls(): HTMLElement[] {
    return dialogEl
      ? Array.from(dialogEl.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1)
      : [];
  }

  function onDialogKey(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const els = focusableEls();
    if (els.length === 0) {
      e.preventDefault();
      dialogEl?.focus();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => dialogEl?.focus(), 0);
  });

  onDestroy(() => {
    previousFocus?.focus();
  });
</script>

<svelte:window on:keydown={onKey} />

<div
  class="popup footnote-popup"
  bind:this={dialogEl}
  style="left:{pos.left};top:{pos.top}"
  role="dialog"
  aria-label="Footnote {n}"
  aria-modal="true"
  tabindex="-1"
  on:mouseenter={onHoverIn}
  on:mouseleave={onHoverOut}
  on:focus={onHoverIn}
  on:blur={onHoverOut}
  on:keydown={onDialogKey}
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
