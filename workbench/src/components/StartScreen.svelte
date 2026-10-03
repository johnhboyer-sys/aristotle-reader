<script lang="ts">
  // The empty library's start screen (B10). No works ship with the app, so a
  // new user first sees how to begin. Each action shows only when the host
  // passes its handler — the same gating as the library rail's buttons.
  // Large type and real buttons throughout: one of the app's users reads with
  // low vision.
  let {
    onNewDocument,
    onImportSource,
    onImportDisc,
  }: {
    onNewDocument?: () => void;
    /** Import a text, opened on Perseus · FREED. */
    onImportSource?: () => void;
    /** Import a text, opened on the TLG or PHI disc tab. */
    onImportDisc?: () => void;
  } = $props();
</script>

<section class="start" aria-labelledby="start-title">
  <h2 id="start-title">Start a translation</h2>
  <p class="lead">Your library is empty. Choose how to begin.</p>
  <ul class="actions">
    {#if onNewDocument}
      <li>
        <button class="action" onclick={onNewDocument} aria-describedby="start-new-desc">New document</button>
        <p class="desc" id="start-new-desc">Paste text, or open a .txt file.</p>
      </li>
    {/if}
    {#if onImportSource}
      <li>
        <button class="action" onclick={onImportSource} aria-describedby="start-import-desc">Import a text</button>
        <p class="desc" id="start-import-desc">From Perseus · FREED or a TEI file. Needs nothing else installed.</p>
      </li>
    {/if}
    {#if onImportDisc}
      <li>
        <button class="action" onclick={onImportDisc} aria-describedby="start-disc-desc">Add a work from local TLG or PHI files</button>
        <p class="desc" id="start-disc-desc">Needs Diogenes installed.</p>
      </li>
    {/if}
  </ul>
</section>

<style>
  .start {
    max-width: 32rem;
    padding: var(--space-4);
    font-family: var(--font-ui);
    color: var(--text);
  }
  h2 {
    font-family: var(--font-english);
    font-size: 1.6rem;
    font-weight: 500;
    margin: 0 0 var(--space-2);
  }
  .lead {
    font-size: 1.1rem;
    color: var(--text-mid);
    margin: 0 0 var(--space-4);
  }
  .actions {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .action {
    font-family: var(--font-ui);
    font-size: 1.15rem;
    font-weight: 500;
    min-height: 2.75rem;
    color: var(--on-accent);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
    text-align: left;
  }
  .action:hover {
    filter: brightness(1.08);
  }
  .action:focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: 2px;
  }
  .desc {
    font-size: 1rem;
    color: var(--text-mid);
    margin: var(--space-1) 0 0;
  }
</style>
