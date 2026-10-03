<script lang="ts">
  // Asked once per AI provider, before its first send (John 2026-10-03). The
  // title and body come from lib/assist/consent.ts; this only shows them.
  // Mounted on the page by editor/assistController.ts (showConsentDialog).
  // Cancel has the focus, so a stray Enter sends nothing; Esc is Cancel too.
  let {
    title,
    body,
    onAnswer,
  }: { title: string; body: string; onAnswer: (allow: boolean) => void } = $props();

  let cancelBtn = $state<HTMLButtonElement>();
  $effect(() => {
    cancelBtn?.focus();
  });

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onAnswer(false);
    }
  }
</script>

<div class="scrim" role="presentation">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="dialog"
    role="alertdialog"
    aria-modal="true"
    aria-labelledby="consent-title"
    aria-describedby="consent-body"
    tabindex="-1"
    onkeydown={onKeydown}
  >
    <h2 id="consent-title" class="title">{title}</h2>
    <p id="consent-body" class="body">{body}</p>
    <div class="actions">
      <button class="btn" bind:this={cancelBtn} onclick={() => onAnswer(false)}>Cancel</button>
      <button class="btn primary" onclick={() => onAnswer(true)}>Allow</button>
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
    z-index: 60;
  }

  .dialog {
    width: 420px;
    max-width: calc(100vw - 2 * var(--space-4));
    padding: var(--space-4);
    background: var(--col-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: var(--popup-shadow);
  }

  .title {
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
  }

  .body {
    margin: var(--space-2) 0 0;
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-mid);
    text-wrap: pretty;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }

  .btn {
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .btn.primary {
    color: var(--on-accent);
    background: var(--accent);
    border-color: var(--accent);
  }
  .btn:hover {
    filter: brightness(1.08);
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
