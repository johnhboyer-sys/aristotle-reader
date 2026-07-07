<script lang="ts">
  // AI output sidebar (Translation Check / AI reference). A right-docked panel
  // — NOT a floating popup — so a long linguistic diagnosis has room to breathe
  // and reads as formatted prose. Content comes from ChapterEditor via the
  // session bridge (session.aiPanel); the model's Markdown is rendered to safe
  // HTML by lib/assist/markdown. Close aborts the in-flight request in the
  // editor; Copy puts the raw text on the clipboard.
  import { tick } from 'svelte';
  import { session, assistCommands } from '../lib/editor/session.svelte';
  import { renderMarkdown } from '../lib/assist/markdown';
  import '../lib/assist/ai-prose.css';

  const panel = $derived(session.aiPanel);
  const html = $derived(
    panel?.state.kind === 'text' ? renderMarkdown(panel.state.text) : '',
  );

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  let bodyEl = $state<HTMLDivElement>();

  // Scroll back to the top whenever a fresh result lands (a new diagnosis for a
  // different line shouldn't inherit the last one's scroll position).
  $effect(() => {
    if (panel?.state.kind === 'text') void tick().then(() => bodyEl?.scrollTo({ top: 0 }));
  });

  async function copy() {
    const ok = await assistCommands.copyAiPanel();
    if (!ok) return;
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1500);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      assistCommands.closeAiPanel();
    }
  }
</script>

{#if panel}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside class="ai-panel" aria-label={panel.title} onkeydown={onKeydown}>
    <header class="ai-head">
      <h2 class="ai-title">{panel.title}</h2>
      {#if panel.locus}
        <span class="ai-locus">{panel.locus}</span>
      {/if}
      <span class="ai-spacer"></span>
      <button class="ai-close" onclick={() => assistCommands.closeAiPanel()} aria-label="Close panel">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>

    <div class="ai-body" bind:this={bodyEl}>
      {#if panel.state.kind === 'thinking'}
        <p class="ai-status">Thinking…</p>
      {:else if panel.state.kind === 'error'}
        <p class="ai-status error">{panel.state.text}</p>
      {:else}
        <!-- eslint-disable-next-line svelte/no-at-html-tags — html is renderMarkdown() output, XSS-safe (input escaped first) -->
        <div class="ai-prose">{@html html}</div>
      {/if}
    </div>

    <footer class="ai-actions">
      <button class="ai-btn" onclick={copy} disabled={panel.state.kind !== 'text'}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </footer>
  </aside>
{/if}

<style>
  .ai-panel {
    flex: none;
    width: 380px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--page-bg);
    border-left: 1px solid var(--border);
  }

  .ai-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .ai-title {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .ai-locus {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-light);
    font-variant-numeric: tabular-nums;
  }
  .ai-spacer {
    flex: 1;
  }
  .ai-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    flex: none;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
    transition: color 0.12s ease, background 0.12s ease;
  }
  .ai-close:hover {
    color: var(--text);
    background: var(--ui-hover);
  }
  .ai-close:active {
    scale: 0.96;
  }

  .ai-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4) var(--space-4) var(--space-5);
  }

  .ai-status {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--text-light);
    font-style: italic;
  }
  .ai-status.error {
    color: var(--text-mid);
  }

  /* Rendered-Markdown prose styling is shared with the Ask panel and lives in
     lib/assist/ai-prose.css (imported above), since {@html} output isn't
     scoped by Svelte. */

  .ai-actions {
    flex: none;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
  }
  .ai-btn {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    padding: 0.25rem 0.7rem;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-mid);
    cursor: pointer;
    transition: color 0.12s ease, border-color 0.12s ease;
  }
  .ai-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--text-light);
  }
  .ai-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
