<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fetchFootnotes } from '../lib/data';
  import { formatNoteHtml } from '../lib/note-format';

  // Endnote presentation for commentary-class notes (sentinel render=endnote,
  // John's UX call 2026-07-10): a slide-in right sidebar — the settings-
  // sidebar shell — instead of FootnotePopup's floating popup. Apostle's
  // notes are full commentary paragraphs; a sidebar keeps the reading
  // position and gives them room.
  export let work: string = 'EN';
  export let n: string;             // full label identity, e.g. "1.5.3"
  export let transId: string = '';
  export let onClose: () => void;

  let html = '';
  let loading = true;
  let error = '';
  let panelEl: HTMLElement;
  let previousFocus: HTMLElement | null = null;

  // Same two-line display rule as FootnotePopup/Reader: a scoped label's
  // trailing component is the printed number.
  function fnDisplay(label: string): string {
    if (label === '*' || label === '†') return label;
    const i = label.lastIndexOf('.');
    return i === -1 ? label : label.slice(i + 1);
  }
  $: display = fnDisplay(n);
  // "1.5.3" -> "I.5" chapter context for the header (book as Roman numeral).
  function chapterContext(label: string): string {
    const parts = label.split('.');
    if (parts.length !== 3) return '';
    const romans = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const book = Number(parts[0]);
    return `${romans[book] ?? parts[0]}.${parts[1]}`;
  }
  $: context = chapterContext(n);

  // Resolution mirrors FootnotePopup: import hook first (desktop), else the
  // work's built-in footnotes.json. See FootnotePopup.svelte for why these
  // are window-level hooks rather than imports (site build has no imports.ts).
  function isImportedTrans(): boolean {
    if (!transId) return false;
    const hook = (globalThis as {
      __ARISTOTLE_IMPORT_HAS_TRANS__?: (work: string, id: string) => boolean;
    }).__ARISTOTLE_IMPORT_HAS_TRANS__;
    return hook ? hook(work, transId) : false;
  }

  function resolve(label: string) {
    loading = true;
    error = '';
    if (isImportedTrans()) {
      const hook = (globalThis as {
        __ARISTOTLE_IMPORT_FOOTNOTE_HOOK__?: (work: string, id: string, label: string) => string | null;
      }).__ARISTOTLE_IMPORT_FOOTNOTE_HOOK__;
      const note = hook ? hook(work, transId, label) : null;
      html = note ? formatNoteHtml(note) : '';
      if (!html) error = `Note ${fnDisplay(label)} not found.`;
      loading = false;
    } else {
      fetchFootnotes(work)
        .then((map) => {
          // built-in notes are pre-rendered HTML — pass through unformatted
          html = map[label] ?? '';
          if (!html) error = `Note ${fnDisplay(label)} not found.`;
        })
        .catch((e) => { error = String(e); })
        .finally(() => { loading = false; });
    }
  }
  $: resolve(n);

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTimeout(() => panelEl?.focus(), 0);
  });

  onDestroy(() => {
    previousFocus?.focus();
  });
</script>

<svelte:window on:keydown={onKey} />

<aside
  class="endnote-sidebar open"
  bind:this={panelEl}
  aria-label="Endnote {display}"
  tabindex="-1"
>
  <div class="endnote-head">
    <span class="endnote-title">Note {display}{context ? ` · ${context}` : ''}</span>
    <button class="popup-close" on:click={onClose} aria-label="Close">✕</button>
  </div>
  <div class="endnote-body">
    {#if loading}
      <div class="popup-loading">Loading…</div>
    {:else if error}
      <div class="popup-loading">{error}</div>
    {:else}
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <div class="endnote-text">{@html html}</div>
    {/if}
  </div>
</aside>
