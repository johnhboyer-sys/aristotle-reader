<script lang="ts">
  // Shown at startup, before the library loads, when the user's own library
  // folder cannot be used: never picked in this build's dialogs (every
  // existing user, once — earlier builds kept no picks), or moved. Without it
  // the library would open empty (workbench-design/sandboxing-plan.md,
  // phase 4). Two ways forward and no close button: choosing nothing would
  // leave the library empty and every save failing.
  import { chooseAgainLabel, repickReason } from '../lib/picks';
  import type { PickStatus } from '../lib/picks';
  import { invalidateLibraryRootCache, repickLibraryRoot } from '../lib/library/storage';
  import { updateSettings } from '../lib/settings';

  let {
    path,
    status,
    onDone,
  }: { path: string; status: Exclude<PickStatus, 'ok'>; onDone: () => void } = $props();

  let busy = $state(false);
  let note = $state<string | null>(null);

  async function chooseAgain() {
    busy = true;
    note = null;
    try {
      if (await repickLibraryRoot(path)) onDone();
    } catch (err) {
      console.error('[library] choosing the folder again failed', err);
      note = 'That folder couldn’t be opened. Try again, or use the default location.';
    } finally {
      busy = false;
    }
  }

  async function useDefault() {
    busy = true;
    try {
      await updateSettings({ libraryRoot: undefined });
      invalidateLibraryRootCache();
      onDone();
    } finally {
      busy = false;
    }
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Library folder">
    <header class="dialog-head">
      <h2>Library folder</h2>
    </header>
    <div class="dialog-body">
      <p class="line">{repickReason('library', status, path)}</p>
      {#if status === 'not-picked'}
        <p class="line path">{path}</p>
      {/if}
      {#if note}
        <p class="line">{note}</p>
      {/if}
      <button class="folder-btn" onclick={chooseAgain} disabled={busy}>{chooseAgainLabel('library')}</button>
      <button class="text-btn" onclick={useDefault} disabled={busy}>Use the default location instead</button>
      <p class="line hint">The default keeps the library on this Mac. Nothing in your folder is changed or deleted.</p>
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

  .dialog-body {
    padding: var(--space-4);
  }

  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
  }
  .line + .line {
    margin-top: var(--space-2);
  }
  .path {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .hint {
    margin-top: var(--space-3);
    font-size: 0.8rem;
  }

  .folder-btn {
    display: block;
    margin-top: var(--space-3);
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
  .folder-btn:hover {
    filter: brightness(1.08);
  }

  .text-btn {
    display: block;
    margin-top: var(--space-2);
    padding: 0;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--accent);
    background: none;
    border: none;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
