<script lang="ts">
  // The app's settings dialog. Was one long scrolling body (AI assist stacked
  // on the library folder); now a tab strip over four panes, each its own
  // component, so a new setting lands in a pane instead of lengthening a
  // scroll. The panes own their own persistence — this shell only chooses
  // which one is mounted.
  //
  // Tab strip semantics follow the WAI-ARIA tabs pattern: roving tabindex,
  // arrow keys move between tabs, only the selected panel is in the tree.
  import type { WorkManifest } from '../lib/works/manifest';
  import { isTauri } from '../lib/runtime';
  import AssistSettings from './AssistSettings.svelte';
  import LibraryFolderSettings from './LibraryFolderSettings.svelte';
  import ExportSettings from './ExportSettings.svelte';
  import LexiconSettings from './LexiconSettings.svelte';

  let { works, onClose }: { works: WorkManifest[]; onClose: () => void } = $props();

  type TabId = 'general' | 'assist' | 'export' | 'lexicon';
  const TABS: { id: TabId; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'assist', label: 'AI assist' },
    { id: 'export', label: 'Export' },
    { id: 'lexicon', label: 'Lexicon' },
  ];

  let active = $state<TabId>('general');
  let tabButtons: HTMLButtonElement[] = [];

  function selectAt(index: number) {
    const next = TABS[(index + TABS.length) % TABS.length];
    active = next.id;
    tabButtons[TABS.indexOf(next)]?.focus();
  }

  function onTabKeydown(e: KeyboardEvent, index: number) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        selectAt(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        selectAt(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        selectAt(0);
        break;
      case 'End':
        e.preventDefault();
        selectAt(TABS.length - 1);
        break;
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Settings">
    <header class="dialog-head">
      <h2>Settings</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="tabs" role="tablist" aria-label="Settings sections">
      {#each TABS as tab, i (tab.id)}
        <button
          class="tab"
          class:active={active === tab.id}
          role="tab"
          id={`settings-tab-${tab.id}`}
          aria-selected={active === tab.id}
          aria-controls={`settings-panel-${tab.id}`}
          tabindex={active === tab.id ? 0 : -1}
          bind:this={tabButtons[i]}
          onclick={() => (active = tab.id)}
          onkeydown={(e) => onTabKeydown(e, i)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <div
      class="dialog-body"
      role="tabpanel"
      id={`settings-panel-${active}`}
      aria-labelledby={`settings-tab-${active}`}
      tabindex="0"
    >
      {#if active === 'general'}
        {#if isTauri()}
          <LibraryFolderSettings {works} />
        {:else}
          <p class="settings-line muted">
            The library folder is set in the app; there is nothing to configure in this dev harness.
          </p>
        {/if}
      {:else if active === 'assist'}
        <!-- Always available: AI assist works in the browser dev harness too;
             only Detect needs Tauri. -->
        <AssistSettings />
      {:else if active === 'export'}
        <ExportSettings />
      {:else}
        <LexiconSettings />
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
    width: 460px;
    max-width: calc(100vw - 2 * var(--space-4));
    /* A FIXED height, not a content-driven one (John, 2026-07-31): letting each
       pane size the dialog made it jump every time you changed tab. A longer
       pane scrolls inside the body instead. Capped by the viewport so a short
       window still fits. */
    height: 560px;
    max-height: calc(100vh - 2 * var(--space-4));
    display: flex;
    flex-direction: column;
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 12px;
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

  .tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3) 0;
    border-bottom: 1px solid var(--border);
  }

  .tab {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-light);
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    padding: var(--space-2) var(--space-3);
    margin-bottom: -1px;
    cursor: pointer;
  }
  .tab:hover {
    color: var(--text-mid);
  }
  .tab.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .dialog-body {
    padding: var(--space-4);
    overflow-y: auto;
  }
</style>
