<script lang="ts">
  // Ask-AI panel: a full-height RIGHT sidebar (John: chat reads best tall, not
  // wide). Sits in App.svelte's right-panel slot alongside the other side
  // panels. The translator types a free-form question about the current line;
  // the AI answers as a helpful classicist. ONE-SHOT: each question is sent
  // independently (with the passage context, but NOT prior turns) — the
  // transcript below accumulates only so it reads like a conversation. Where
  // multi-turn would slot in: thread the transcript into the prompt in
  // ChapterEditor.askAboutLine (session bridge), not here.
  //
  // The transcript clears when the target line changes — a one-shot "ask about
  // THIS line" panel shouldn't carry another line's Q&A. The header shows which
  // model is answering (a reminder), read from the assist settings.
  import { tick } from 'svelte';
  import { session, assistCommands } from '../lib/editor/session.svelte';
  import { renderMarkdown } from '../lib/assist/markdown';
  import { assistProviderLabel } from '../lib/assist/providerLabel';
  import { loadSettings } from '../lib/settings';
  import '../lib/assist/ai-prose.css';

  let { onClose }: { onClose: () => void } = $props();

  // One transcript entry: the question, then the AI's answer (or the pending /
  // error state). ONE-SHOT — entries are display-only, never re-sent.
  type Entry = {
    question: string;
    state: { kind: 'thinking' } | { kind: 'answer'; text: string } | { kind: 'error'; text: string };
  };
  let transcript = $state<Entry[]>([]);
  let draft = $state('');
  let sending = $state(false);
  let providerLabel = $state('');

  let inputEl = $state<HTMLTextAreaElement>();
  let transcriptEl = $state<HTMLDivElement>();

  const locus = $derived(session.askTarget?.locus ?? null);

  // Refresh the provider label whenever the panel (re)opens — the user may have
  // changed the assist provider in Settings between opens.
  $effect(() => {
    if (session.askPanelOpen) void loadSettings().then((s) => (providerLabel = assistProviderLabel(s.assist)));
  });

  // Clear the transcript when the target line changes — a one-shot "ask about
  // THIS line" panel shouldn't carry over another line's Q&A. Keyed on the
  // opaque address so a same-locus different-line still resets.
  let lastAddress: string | null = null;
  $effect(() => {
    const addr = session.askTarget?.address ?? null;
    if (addr !== lastAddress) {
      lastAddress = addr;
      transcript = [];
    }
  });

  // Focus the input whenever the panel is (re)opened.
  $effect(() => {
    if (session.askPanelOpen) void tick().then(() => inputEl?.focus());
  });

  async function scrollTranscriptToEnd() {
    await tick();
    if (transcriptEl) transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  async function send() {
    const question = draft.trim();
    if (question.length === 0 || sending) return;
    draft = '';
    sending = true;
    const idx = transcript.length;
    transcript = [...transcript, { question, state: { kind: 'thinking' } }];
    void scrollTranscriptToEnd();

    const result = await assistCommands.askAboutLine(question);
    // The panel may have moved to a different line while awaiting; only update
    // the entry if it's still in the current transcript.
    if (transcript[idx]?.question === question) {
      const next = transcript.slice();
      next[idx] = {
        question,
        state: result.ok ? { kind: 'answer', text: result.answer } : { kind: 'error', text: result.message },
      };
      transcript = next;
      void scrollTranscriptToEnd();
    }
    sending = false;
    void tick().then(() => inputEl?.focus());
  }

  function onInputKeydown(e: KeyboardEvent) {
    // Enter sends; Shift+Enter is a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside class="ask-panel" aria-label="Ask AI" onkeydown={onKeydown}>
  <header class="ask-head">
    <div class="ask-head-titles">
      <div class="ask-title-row">
        <h2 class="ask-title">Ask AI</h2>
        {#if locus}
          <span class="ask-locus">{locus}</span>
        {/if}
      </div>
      {#if providerLabel}
        <span class="ask-model" title="The AI model answering your questions">via {providerLabel}</span>
      {/if}
    </div>
    <button class="ask-close" onclick={onClose} aria-label="Close Ask AI">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  </header>

  <div class="ask-transcript" bind:this={transcriptEl}>
    {#if transcript.length === 0}
      <p class="ask-placeholder">
        Ask a question about this line — its grammar, a word, the syntax, or your own draft. Each
        question is answered on its own.
      </p>
    {:else}
      {#each transcript as entry, i (i)}
        <div class="ask-turn">
          <p class="ask-question">{entry.question}</p>
          {#if entry.state.kind === 'thinking'}
            <p class="ask-answer thinking">Thinking…</p>
          {:else if entry.state.kind === 'answer'}
            <!-- eslint-disable-next-line svelte/no-at-html-tags — renderMarkdown() output is XSS-safe (input escaped first) -->
            <div class="ask-answer ai-prose">{@html renderMarkdown(entry.state.text)}</div>
          {:else}
            <p class="ask-answer error">{entry.state.text}</p>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <div class="ask-input-row">
    <textarea
      bind:this={inputEl}
      bind:value={draft}
      class="ask-input"
      rows="3"
      placeholder="Ask about this line…"
      onkeydown={onInputKeydown}
      disabled={sending}
      aria-label="Your question"
    ></textarea>
    <button class="ask-send" onclick={send} disabled={sending || draft.trim().length === 0}>
      {sending ? 'Asking…' : 'Send'}
    </button>
  </div>
</aside>

<style>
  .ask-panel {
    flex: none;
    width: 360px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--page-bg);
    border-left: 1px solid var(--border);
  }

  .ask-head {
    flex: none;
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }
  .ask-head-titles {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .ask-title-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .ask-title {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-mid);
  }
  .ask-locus {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-light);
    font-variant-numeric: tabular-nums;
  }
  .ask-model {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-light);
    letter-spacing: 0.01em;
  }
  .ask-close {
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
  .ask-close:hover {
    color: var(--text);
    background: var(--ui-hover);
  }
  .ask-close:active {
    scale: 0.96;
  }

  .ask-transcript {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .ask-placeholder {
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.55;
    color: var(--text-light);
    font-style: italic;
    text-wrap: pretty;
  }

  .ask-turn {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .ask-question {
    align-self: flex-end;
    max-width: 90%;
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-radius: 12px 12px 3px 12px;
    padding: var(--space-2) var(--space-3);
    white-space: pre-wrap;
  }
  .ask-answer {
    align-self: flex-start;
    max-width: 100%;
    font-family: var(--font-english);
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--text);
    text-wrap: pretty;
  }
  .ask-answer.thinking {
    color: var(--text-light);
    font-style: italic;
  }
  .ask-answer.error {
    color: var(--text-mid);
    font-style: italic;
  }

  .ask-input-row {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--border);
  }
  .ask-input {
    flex: 1;
    min-width: 0;
    resize: none;
    font-family: var(--font-english);
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text);
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: var(--space-2) var(--space-3);
    transition: border-color 0.12s ease;
  }
  .ask-input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .ask-input:disabled {
    opacity: 0.6;
  }
  .ask-send {
    flex: none;
    font-family: var(--font-ui);
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--on-accent);
    background: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 8px;
    padding: var(--space-2) var(--space-4);
    cursor: pointer;
    transition: filter 0.12s ease, scale 0.08s ease;
  }
  .ask-send:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .ask-send:active:not(:disabled) {
    scale: 0.96;
  }
  .ask-send:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
