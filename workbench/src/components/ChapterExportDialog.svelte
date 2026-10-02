<script lang="ts">
  // Single-chapter export: the same choices as the whole-work window
  // (translation only or bilingual, layout, order), seeded from Settings ›
  // Export. The export itself runs in ExportButton, which reports its result in
  // the toolbar note.
  import { getScheme } from '../lib/citation/registry';
  import { exportSettings } from '../lib/export/tauriExport';
  import { seedChoices } from '../lib/export/choices';
  import type { ExportChoices as Choices } from '../lib/export/choices';
  import type { WorkManifest } from '../lib/works/manifest';
  import ExportChoices from './ExportChoices.svelte';

  let {
    work,
    onExport,
    onClose,
  }: {
    work: WorkManifest;
    onExport: (choices: Choices) => void;
    onClose: () => void;
  } = $props();

  let ready = $state(false);
  let mode = $state<Choices['mode']>('english');
  let bilingualLayout = $state<Choices['bilingualLayout']>('block');
  let bilingualOrder = $state<Choices['bilingualOrder']>('original-first');
  let stampMode: Choices['stampMode'];

  $effect(() => {
    void (async () => {
      try {
        const seeded = seedChoices(await exportSettings(), getScheme(work.scheme).spineSource === 'document' ? 'document' : 'corpus');
        mode = seeded.mode;
        bilingualLayout = seeded.bilingualLayout;
        bilingualOrder = seeded.bilingualOrder;
        stampMode = seeded.stampMode;
      } catch (err) {
        console.error('[export] reading Settings › Export failed', err);
      }
      ready = true;
    })();
  });

  function run() {
    onExport({ mode, bilingualLayout, bilingualOrder, stampMode });
    onClose();
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Export chapter">
    <header class="dialog-head">
      <h2>Export chapter</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>
    <div class="dialog-body">
      {#if ready}
        <ExportChoices name="chapter" bind:mode bind:bilingualLayout bind:bilingualOrder />
        <button class="export-btn" onclick={run}>Export…</button>
      {:else}
        <p class="line">Reading the export settings…</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 40;
  }
  .dialog {
    width: 380px;
    max-width: calc(100vw - 2 * var(--space-4));
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--popup-shadow);
  }
  .dialog-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .dialog-head h2 {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .close-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.6rem;
    height: 1.6rem;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
  }
  .close-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }
  .dialog-body {
    padding: var(--space-4);
  }
  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
  }
  .export-btn {
    margin-top: var(--space-4);
    width: 100%;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--on-accent);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .export-btn:hover {
    filter: brightness(1.08);
  }
</style>
