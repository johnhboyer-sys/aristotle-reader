<script lang="ts">
  // Ask-AI panel: a docked, resizable BOTTOM panel (not a popup). Like the
  // lexicon drawer, it's a flex sibling in App.svelte's .center-col — it pushes
  // the editing viewport up rather than floating over it, and stops at the
  // center column so the right rail (footnotes/reference) stays visible.
  //
  // The translator types a free-form question about the current line; the AI
  // answers as a helpful classicist. ONE-SHOT: each question is sent
  // independently (with the passage context, but NOT prior turns) — the
  // transcript below accumulates only so it reads like a conversation. Where
  // multi-turn would slot in: thread the transcript into the prompt in
  // ChapterEditor.askAboutLine (session bridge), not here.
  //
  // Resizable by dragging the top edge (clamped 160px..60vh); reopens at its
  // last dragged height (persisted to localStorage, matching LexiconDrawer).
  // The transcript clears when the target line changes — a one-shot "ask about
  // THIS line" panel shouldn't carry another line's Q&A.
  import { tick } from 'svelte';
  import { session, assistCommands } from '../lib/editor/session.svelte';

  let { onClose }: { onClose: () => void } = $props();

  const HEIGHT_KEY = 'workbench:ask:height';
  const MIN_H = 160;
  const DEFAULT_H = 280;

  function clampHeight(h: number): number {
    const viewportH = window.innerHeight || 0;
    const maxH = viewportH > 0 ? Math.round(viewportH * 0.6) : Infinity;
    return Math.min(Math.max(h, MIN_H), Math.max(MIN_H, maxH));
  }

  function loadHeight(): number {
    if (typeof localStorage === 'undefined') return DEFAULT_H;
    const raw = localStorage.getItem(HEIGHT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? clampHeight(n) : DEFAULT_H;
  }

  let height = $state(loadHeight());
  let dragging = $state(false);
  let dragStartY = 0;
  let dragStartHeight = 0;

  // One transcript entry: the question, then the AI's answer (or the pending /
  // error state). ONE-SHOT — entries are display-only, never re-sent.
  type Entry = {
    question: string;
    state: { kind: 'thinking' } | { kind: 'answer'; text: string } | { kind: 'error'; text: string };
  };
  let transcript = $state<Entry[]>([]);
  let draft = $state('');
  let sending = $state(false);

  let inputEl = $state<HTMLTextAreaElement>();
  let transcriptEl = $state<HTMLDivElement>();

  const locus = $derived(session.askTarget?.locus ?? null);

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

  function startDrag(e: PointerEvent) {
    dragging = true;
    dragStartY = e.clientY;
    dragStartHeight = height;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function onDrag(e: PointerEvent) {
    if (!dragging) return;
    const delta = dragStartY - e.clientY; // dragging up grows the panel
    height = clampHeight(dragStartHeight + delta);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (typeof localStorage !== 'undefined') localStorage.setItem(HEIGHT_KEY, String(Math.round(height)));
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="ask-panel" style="height: {height}px" aria-label="Ask AI" onkeydown={onKeydown}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ask-resize-handle"
    class:dragging
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize Ask AI panel"
    tabindex="-1"
    onpointerdown={startDrag}
    onpointermove={onDrag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
  ></div>

  <header class="ask-head">
    <h2 class="ask-title">Ask AI</h2>
    {#if locus}
      <span class="ask-locus">{locus}</span>
    {/if}
    <span class="ask-spacer"></span>
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
            <p class="ask-answer">{entry.state.text}</p>
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
      rows="2"
      placeholder="Ask about this line…"
      onkeydown={onInputKeydown}
      disabled={sending}
      aria-label="Your question"
    ></textarea>
    <button class="ask-send" onclick={send} disabled={sending || draft.trim().length === 0}>
      {sending ? 'Asking…' : 'Send'}
    </button>
  </div>
</section>

<svelte:window onpointermove={onDrag} onpointerup={endDrag} />

<style>
  .ask-panel {
    flex: none;
    display: flex;
    flex-direction: column;
    min-height: 160px;
    background: var(--page-bg);
    border-top: 1px solid var(--border);
    position: relative;
  }

  .ask-resize-handle {
    position: absolute;
    top: -4px;
    left: 0;
    right: 0;
    height: 8px;
    cursor: row-resize;
    z-index: 5;
    touch-action: none;
  }
  .ask-resize-handle::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 50%;
    transform: translateX(-50%);
    width: 2.5rem;
    height: 3px;
    border-radius: 2px;
    background: var(--border);
  }
  .ask-resize-handle:hover::after,
  .ask-resize-handle.dragging::after {
    background: var(--accent-light);
  }

  .ask-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
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
  .ask-spacer {
    flex: 1;
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
    max-width: 85%;
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
    max-width: 92%;
    font-family: var(--font-english);
    font-size: 0.92rem;
    line-height: 1.6;
    color: var(--text);
    text-wrap: pretty;
    white-space: pre-wrap;
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
