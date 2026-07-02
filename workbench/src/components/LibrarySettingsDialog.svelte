<script lang="ts">
  // Library settings (build spec §11) — Tauri only; App never mounts this in
  // the browser harness (the trigger button itself is gated on isTauri()).
  // One job: let the user point the library at a folder synced by a service
  // like iCloud Drive, Google Drive, or Dropbox, so a collaborator sees the
  // same chapters. Plain files only — no service API, no OAuth. Every
  // failure mode is one plain sentence; stderr never reaches the UI.
  import { loadSettings, updateSettings } from '../lib/settings';
  import { copyLibraryToRoot, invalidateLibraryRootCache } from '../lib/library/storage';
  import type { WorkManifest } from '../lib/works/manifest';

  let { works, onClose }: { works: WorkManifest[]; onClose: () => void } = $props();

  type Phase = 'loading' | 'idle' | 'confirming' | 'moving' | 'done';
  let phase = $state<Phase>('loading');
  let currentRoot = $state<string | null>(null);
  let pendingRoot = $state<string | null>(null);
  let note = $state<string | null>(null);
  let helpOpen = $state(false);

  $effect(() => {
    void (async () => {
      const settings = await loadSettings();
      currentRoot = settings.libraryRoot ?? null;
      phase = 'idle';
    })();
  });

  async function chooseFolder() {
    const dialog = await import('@tauri-apps/plugin-dialog');
    const picked = await dialog.open({
      directory: true,
      multiple: false,
      title: 'Choose the shared folder for the library',
    });
    if (typeof picked !== 'string') return; // cancelled
    if (picked === currentRoot) return;

    // Always offer the copy step, even when currentRoot is the default
    // location — there may still be chapters there worth copying forward,
    // and skipping the ask would risk silently orphaning them.
    pendingRoot = picked;
    phase = 'confirming';
  }

  async function confirmMove(copy: boolean) {
    if (!pendingRoot) return;
    const newRoot = pendingRoot;
    if (copy) {
      phase = 'moving';
      note = 'Copying your chapters to the new folder…';
      try {
        const workIds = works.map((w) => w.id);
        const count = await copyLibraryToRoot(workIds, newRoot);
        note = count > 0 ? `Copied ${count} chapter file${count === 1 ? '' : 's'} to the new folder.` : 'Nothing to copy yet.';
      } catch (err) {
        console.error('library settings: copy failed', err);
        note = "Couldn't copy your chapters to the new folder — nothing was moved or deleted.";
        phase = 'done';
        return;
      }
    }
    await updateSettings({ libraryRoot: newRoot });
    invalidateLibraryRootCache();
    currentRoot = newRoot;
    pendingRoot = null;
    phase = 'done';
    if (!copy) note = 'Library folder changed. Existing chapter files were left where they were.';
  }

  function cancelMove() {
    pendingRoot = null;
    phase = 'idle';
    note = null;
  }

  async function useDefault() {
    if (currentRoot === null) return;
    pendingRoot = null; // clearing, not moving TO anywhere
    await updateSettings({ libraryRoot: undefined });
    invalidateLibraryRootCache();
    currentRoot = null;
    note = 'Back to the default library location. Files in the shared folder were left in place.';
    phase = 'done';
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-label="Library settings">
    <header class="dialog-head">
      <h2>Library settings</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="dialog-body">
      {#if phase === 'loading'}
        <p class="line">Checking…</p>
      {:else if phase === 'confirming'}
        <p class="line">
          Copy your current chapters into the new folder? Nothing is deleted from where they are now.
        </p>
        <p class="line path">{pendingRoot}</p>
        <div class="row-actions">
          <button class="secondary-btn" onclick={() => confirmMove(false)}>Just switch, don't copy</button>
          <button class="primary-btn" onclick={() => confirmMove(true)}>Copy and switch</button>
        </div>
        <button class="text-btn" onclick={cancelMove}>Cancel</button>
      {:else if phase === 'moving'}
        <p class="line">{note}</p>
      {:else}
        <p class="label">Store my library in…</p>
        {#if currentRoot}
          <p class="line path">{currentRoot}</p>
        {:else}
          <p class="line muted">This Mac's app data (default).</p>
        {/if}

        <div class="row-actions">
          <button class="secondary-btn" onclick={chooseFolder}>Choose folder…</button>
          {#if currentRoot}
            <button class="text-btn" onclick={useDefault}>Use the default location instead</button>
          {/if}
        </div>

        {#if note}
          <p class="line">{note}</p>
        {/if}

        <button class="help-toggle" onclick={() => (helpOpen = !helpOpen)} aria-expanded={helpOpen}>
          Sharing this library
          <svg class="chevron" class:open={helpOpen} viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        {#if helpOpen}
          <div class="help-body">
            <p>
              Point two Macs at the same folder synced by iCloud Drive, Google Drive, or Dropbox and
              you and a collaborator can work from the same library.
            </p>
            <p>Have one person edit a given chapter at a time — the app reloads it automatically once the other person's changes arrive.</p>
            <p>
              If you both edit the same chapter at the same time anyway, the sync service saves a
              second copy; it shows up flagged in the library list rather than silently overwriting
              anything.
            </p>
            <p class="icloud-note">
              iCloud Drive sometimes resolves a collision on its own, keeping only the newer save with
              no extra file at all — one more reason to treat "one editor per chapter" as the rule, not
              the fallback.
            </p>
          </div>
        {/if}
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
    width: 420px;
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

  .label {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--text-mid);
    margin-bottom: var(--space-1);
  }

  .line {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text);
  }
  .line + .line {
    margin-top: var(--space-2);
  }
  .line.muted {
    color: var(--text-light);
    font-style: italic;
  }
  .line.path {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text-mid);
    word-break: break-all;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-2);
  }

  .row-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }

  .primary-btn {
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
  .primary-btn:hover {
    filter: brightness(1.08);
  }

  .secondary-btn {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    color: var(--text-mid);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .secondary-btn:hover {
    color: var(--text);
    background: var(--ui-hover);
  }

  .text-btn {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text-light);
    background: transparent;
    border: none;
    padding: var(--space-1) 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .text-btn:hover {
    color: var(--text-mid);
  }

  .help-toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-4);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-mid);
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .help-toggle:hover {
    color: var(--text);
  }
  .chevron {
    transition: transform 0.12s ease;
  }
  .chevron.open {
    transform: rotate(90deg);
  }

  .help-body {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-family: var(--font-english);
    font-size: 0.85rem;
    line-height: 1.55;
    color: var(--text-mid);
  }
  .help-body p + p {
    margin-top: var(--space-2);
  }
  .help-body .icloud-note {
    color: var(--text-light);
    font-style: italic;
  }
</style>
