<script lang="ts">
  let {
    title,
    initialAuthor,
    onClose,
    onSave,
  }: {
    title: string;
    initialAuthor: string;
    onClose: () => void;
    onSave: (author: string) => Promise<void>;
  } = $props();

  let author = $state(initialAuthor);
  let errorMessage = $state<string | null>(null);
  let writing = $state(false);

  async function save() {
    if (writing) return;
    writing = true;
    errorMessage = null;
    try {
      await onSave(author);
      onClose();
    } catch (err) {
      console.error('WorkDetailsDialog save', err);
      errorMessage = "The work details couldn't be saved.";
      writing = false;
    }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    void save();
  }
</script>

<div class="scrim" role="presentation">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="work-details-title">
    <header class="dialog-head">
      <h2 id="work-details-title">{title}</h2>
      <button class="close-btn" onclick={onClose} aria-label="Close">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <form class="dialog-body" onsubmit={submit}>
      {#if errorMessage}
        <p class="error">{errorMessage}</p>
      {/if}
      <label for="work-author">Author</label>
      <input id="work-author" type="text" bind:value={author} />

      <div class="form-actions">
        <button class="secondary-btn" type="button" onclick={onClose}>Cancel</button>
        <button class="primary-btn" type="submit" disabled={writing}>
          {writing ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
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
  .dialog-body label {
    display: block;
    margin-bottom: var(--space-1);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-mid);
  }
  .dialog-body input {
    width: 100%;
    box-sizing: border-box;
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.35rem 0.5rem;
  }
  .error {
    margin-bottom: var(--space-3);
    font-family: var(--font-english);
    font-size: 0.9rem;
    color: var(--error);
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
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
  .primary-btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: default;
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
</style>
