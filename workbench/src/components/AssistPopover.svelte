<script lang="ts">
  // Non-modal AI-assist popover (design doc D4 divergence B): anchored under
  // the target row's English cell (rendered by RowEditor inside the
  // position:relative .en-cell; layout in editor.css, same quiet chrome as
  // the paste-confirm bar). Three states:
  //   thinking   — "Thinking…" with Cancel (dismiss = abort the request)
  //   suggestion — the text + Insert / Dismiss
  //   message    — ONE vetted plain sentence from src/lib/assist/messages.ts
  //                (this component never composes its own error text)
  // Esc dismisses too — handled by ChapterEditor's root keydown so it works
  // while the caret stays in the row.
  import type { AssistUiState } from '../lib/editor/assistController';

  let {
    state,
    onInsert,
    onDismiss,
  }: {
    state: AssistUiState;
    onInsert: () => void;
    onDismiss: () => void;
  } = $props();

  // Keep the popover inside the window. It's position:absolute; left:0 anchored
  // to the English cell, so in the full-width flowing views a wide suggestion
  // runs off the right edge. Measure after render and nudge it left (via
  // transform, leaving the anchor intact) so its right edge stays in view;
  // never push it off the left. Re-runs when the content (and thus width)
  // changes — thinking → suggestion.
  let el = $state<HTMLDivElement>();
  $effect(() => {
    void state;
    const node = el;
    if (!node || typeof window === 'undefined') return;
    node.style.transform = '';
    const rect = node.getBoundingClientRect();
    const MARGIN = 8;
    let dx = 0;
    const overRight = rect.right - (window.innerWidth - MARGIN);
    if (overRight > 0) dx = -overRight;
    if (rect.left + dx < MARGIN) dx = MARGIN - rect.left;
    if (dx !== 0) node.style.transform = `translateX(${dx}px)`;
  });
</script>

<div class="assist-popover" role="dialog" aria-label="Translation suggestion" bind:this={el}>
  {#if state.kind === 'thinking'}
    <span class="assist-note">Thinking…</span>
    <button class="assist-btn" type="button" onclick={onDismiss}>Cancel</button>
  {:else if state.kind === 'suggestion'}
    <p class="assist-text">{state.text}</p>
    <div class="assist-actions">
      <button class="assist-btn assist-btn-primary" type="button" onclick={onInsert}>Insert</button>
      <button class="assist-btn" type="button" onclick={onDismiss}>Dismiss</button>
    </div>
  {:else}
    <span class="assist-note">{state.text}</span>
    <button class="assist-btn" type="button" onclick={onDismiss}>OK</button>
  {/if}
</div>
